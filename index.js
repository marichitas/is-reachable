'use strict';
const {promisify} = require('util');
const dns = require('dns');
const net = require('net');
const arrify = require('arrify');
const got = require('got');
const isPortReachable = require('is-port-reachable');
const pAny = require('p-any');
const pTimeout = require('p-timeout');
const prependHttp = require('prepend-http');
const routerIps = require('router-ips');
const URL = require('url-parse');

const dnsLookupP = promisify(dns.lookup);

const checkHttp = async (url, timeout) => {
	let response;
	try {
		response = await got(url, {
			https: {
				rejectUnauthorized: false
			},
			retry: 0,
			timeout
		});
	} catch {
		return false;
	}

	if (response.headers && response.headers.location) {
		const url = new URL(response.headers.location);
		const hostname = url.hostname.replace(/^\[/, '').replace(/]$/, ''); // Strip [] from IPv6
		return !routerIps.has(hostname);
	}

	return true;
};

const getAddress = async hostname => net.isIP(hostname) ? hostname : (await dnsLookupP(hostname)).address;

const isTargetReachable = timeout => async target => {
	const url = new URL(prependHttp(target));

	if (!url.port) {
		url.port = url.protocol === 'http:' ? 80 : 443;
	}

	let address;
	try {
		address = await getAddress(url.hostname);
	} catch {
		return false;
	}

	if (!address || routerIps.has(address)) {
		return false;
	}

	if ([80, 443].includes(url.port)) {
		return checkHttp(url.toString(), timeout);
	}

	return isPortReachable(url.port, {host: address, timeout});
};

module.exports = async (destinations, {timeout = 5000} = {}) => {
	const promise = pAny(arrify(destinations).map(isTargetReachable(timeout)));

	try {
		return await pTimeout(promise, timeout);
	} catch {
		return false;
	}
};
