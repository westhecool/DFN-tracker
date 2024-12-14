// Run with bunjs (https://bun.sh)
const { EventEmitter } = require('events');
const { version } = require('./package.json');
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': '*',
};
const ecodes = {
    UPGRADE_REQUIRED: 0,
    UKNOWN_EVENT: 1,
    INVALID_DATA: 2,
    HOSTNAME_LOCKED: 3
}
const peerEvents = new EventEmitter();
peerEvents.setMaxListeners(0);
var peers = {};
const server = Bun.serve({
    port: process.env.PORT || 3000,
    fetch(req, server) {
        const remoteAddress = server.requestIP(req).address;
        if (server.upgrade(req, { headers: corsHeaders, data: { hostname: null, lookingFor: [], remoteAddress, onpeer: null } })) {
            return; // do not return a Response
        }
        const url = '/' + req.url.split('://')[1].split('/').slice(1).join('/'); // The url is a full url for some reason
        if (url === '/version') {
            return new Response(JSON.stringify({ version }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } else {
            return new Response(JSON.stringify({ error: 'Upgrade Required', ecode: ecodes.UPGRADE_REQUIRED }), { status: 426, headers: { 'Content-Type': 'text/plain', ...corsHeaders } });
        }
    },
    websocket: {
        message(ws, data) {
            const message = JSON.parse(data);
            if (message.event === 'ping') {
                ws.send(JSON.stringify({ event: 'pong' }));
            } else if (message.event === 'version') {
                ws.send(JSON.stringify({ event: 'version', version }));
            } else if (message.event === 'find-peers') {
                if (Array.isArray(message.files)) {
                    ws.data.lookingFor = message.files;
                    // Look for any existing peers
                    for (const file of ws.data.lookingFor) {
                        for (const peer of Object.keys(peers)) {
                            if (peers[peer].files.includes(file)) {
                                ws.send(JSON.stringify({ event: 'peer', fileHash: file, peer: peer }));
                            }
                        }
                    }
                    ws.data.onpeer = (peer) => {
                        for (const file of ws.data.lookingFor) {
                            if (peers[peer].files.includes(file)) {
                                ws.send(JSON.stringify({ event: 'peer', fileHash: file, peer: peer }));
                            }
                        }
                    };
                    peerEvents.addListener('peer', ws.data.onpeer);
                } else {
                    ws.send(JSON.stringify({ event: 'error', ecode: ecodes.INVALID_DATA }));
                }
            } else if (message.event === 'announce-files') {
                if (Array.isArray(message.files) && message.hostname) {
                    if (peers[data.hostname] && peers[data.hostname].remoteAddress !== ws.data.remoteAddress) {
                        ws.send(JSON.stringify({ event: 'error', ecode: ecodes.HOSTNAME_LOCKED }));
                        return;
                    }
                    ws.data.hostname = message.hostname;
                    peers[ws.data.hostname] = {
                        remoteAddress: ws.data.remoteAddress,
                        files: message.files
                    };
                    peerEvents.emit('peer', ws.data.hostname);
                } else {
                    ws.send(JSON.stringify({ event: 'error', ecode: ecodes.INVALID_DATA }));
                }
            }
        },
        close(ws, code, message) {
            if (ws.data.onpeer) peerEvents.removeListener('peer', ws.data.onpeer);
            if (ws.data.hostname) delete peers[ws.data.hostname];
        }
    }
});
console.log(`Server running at http://localhost:${process.env.PORT || 3000} (http://0.0.0.0:${process.env.PORT || 3000})`);