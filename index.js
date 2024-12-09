const http = require('http');
const { version } = require('./package.json');
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': '*',
};
var peers = {};
function cleanUpPeers() {
    for (const peer of Object.keys(peers)) {
        if (Date.now() - peers[peer].lastSeen > 60000) { // 1 minute
            delete peers[peer];
        }
    }
}
setInterval(cleanUpPeers, 10000);
const server = http.createServer((req, res) => {
    if (req.url === '/version') {
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ version }));
    } else if (req.method === 'OPTIONS') {
        res.writeHead(200, corsHeaders);
        res.end();
    } else if (req.method === 'POST') {
        let body = Buffer.alloc(0);
        req.on('data', (chunk) => {
            body = Buffer.concat([body, chunk]);
        });
        req.once('end', () => {
            try {
                if (req.url === '/find-peers') {
                    const files = JSON.parse(body.toString());
                    if (!Array.isArray(files) || files.length === 0) {
                        res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
                        res.end(JSON.stringify({ error: 'No files provided to find peers for' }));
                        return;
                    }
                    let result = {};
                    for (const file of files) {
                        result[file] = [];
                        for (const peer of Object.keys(peers)) {
                            if (peers[peer].files.includes(file)) {
                                result[file].push(peer);
                            }
                        }
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
                    res.end(JSON.stringify(result));
                } else if (req.url === '/announce-files') {
                    const data = JSON.parse(body.toString());
                    const remoteAddress = req.socket.remoteAddress;
                    if (!Array.isArray(data.files) || !data.hostname) {
                        res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
                        res.end(JSON.stringify({ error: 'Invalid data' }));
                        return;
                    }
                    if (peers[data.hostname] && peers[data.hostname].remoteAddress !== remoteAddress) {
                        res.writeHead(403, { 'Content-Type': 'application/json', ...corsHeaders });
                        res.end(JSON.stringify({ error: 'Peer is locked to another address' }));
                        return;
                    }
                    peers[data.hostname] = {
                        remoteAddress,
                        files: data.files,
                        lastSeen: Date.now()
                    };
                    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
                    res.end(JSON.stringify({ success: true }));
                } else if (req.url === '/ping') {
                    const data = JSON.parse(body.toString());
                    const remoteAddress = req.socket.remoteAddress;
                    if (!data.hostname) {
                        res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
                        res.end(JSON.stringify({ error: 'Invalid hostname' }));
                        return;
                    }
                    if (peers[data.hostname]) {
                        if (peers[data.hostname].remoteAddress !== remoteAddress) {
                            res.writeHead(403, { 'Content-Type': 'application/json', ...corsHeaders });
                            res.end(JSON.stringify({ error: 'Peer is locked to another address' }));
                            return;
                        }
                        peers[data.hostname].lastSeen = Date.now();
                        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
                        res.end(JSON.stringify({ success: true }));
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
                        res.end(JSON.stringify({ error: 'Peer not found' }));
                    }
                } else if (req.url === '/disconnect') {
                    const data = JSON.parse(body.toString());
                    const remoteAddress = req.socket.remoteAddress;
                    if (!data.hostname) {
                        res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
                        res.end(JSON.stringify({ error: 'Invalid hostname' }));
                        return;
                    }
                    if (peers[data.hostname]) {
                        if (peers[data.hostname].remoteAddress !== remoteAddress) {
                            res.writeHead(403, { 'Content-Type': 'application/json', ...corsHeaders });
                            res.end(JSON.stringify({ error: 'Peer is locked to another address' }));
                            return;
                        }
                        delete peers[data.hostname];
                        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
                        res.end(JSON.stringify({ success: true }));
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
                        res.end(JSON.stringify({ error: 'Peer not found' }));
                    }
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders });
                    res.end(JSON.stringify({ error: 'Unknown route' }));
                }
            } catch (error) {
                console.error(error);
                res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
                res.end(JSON.stringify({ error: 'Internal Server Error' }));
            }
        });
    } else {
        res.writeHead(405, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }
});
server.listen(process.env.PORT || 3000, () => {
    console.log(`Server running at http://localhost:${process.env.PORT || 3000} (http://0.0.0.0:${process.env.PORT || 3000})`);
});