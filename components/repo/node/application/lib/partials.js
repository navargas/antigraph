var uuid = require('uuid');
var path = require('path');
var mkdirp = require('mkdirp');
var http = require('http');
var querystring = require('querystring');

var conf = {
    storageDir: '/var/asset-data/'
}

/* httpPost used for communicating with authenticator */
module.exports.httpPost = function(hostname, path, port, params, callback) {
    if (!params) params = {};
    var postData = querystring.stringify(params);
    var httpReq = {
        hostname: hostname,
        port: port,
        method: 'POST',
        path: path,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': postData.length
        }
    };
    // Send http post to hostname:port
    var buffer = '';
    var req = http.request(httpReq, function(res) {
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
            buffer += chunk;
        });
        res.on('end', function() {
            console.log('Status:', res.statusCode);
            if (callback) return callback(res.statusCode, buffer);
        })
    });
    req.write(postData);
    req.end();
}

/* Generic fail response */
module.exports.fail = function(res, message, statusCode) {
    var sc = statusCode || 501;
    res.status(sc).send({
        error: message
    });
}

module.exports.createNew = function(req, res) {
    function createPartialDirectory(key, callback) {
        var email = key.creator;
        if (!email)
            console.error('Creator not defined for key', key);
        // Unique id for each partial upload
        var uniqueId = uuid.v4();
        // Full directory name format: email-uniqueId
        var fullTxId = email + '-' + uniqueId;
        var targetPath = path.join(
            conf.storageDir,
            '.partials',
            fullTxId
        );
        mkdirp(targetPath, function(err) {
            if (err) {
                console.error(err);
                return res.status(500).send(err);
            }
            if (callback) {
                callback(uniqueId);
            }
        });
    }
    var key = req.headers['x-api-key'];
    console.log('key', key);
    module.exports.httpPost('authenticator', '/simple', 80, {key: key},
            function(statusCode, data) {
        if (statusCode !== 201) return res.status(statusCode).send(data);
        var info;
        try {
            info = JSON.parse(data);
        } catch (e) {
            console.error('partials.createNew Unable to parse', info);
            info = undefined;
        }
        if (!info || !info.key) {
            return res.status(statusCode).send(data);
        }
        createPartialDirectory(info.key, function(uniqueId) {
            if (req.headers.accept.toLowerCase() == 'text/plain')
                return res.status(200).send(uniqueId);
            else
                return res.status(200).send({id:uniqueId});
        });
    });
}

module.exports.uploadPartial = function(req, res) {
}
