var md5 = require('md5-file');
var multer = require('multer');
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
        if (info.key.readonly) {
            return res.status(403).send({error:'Readonly key'});
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
    var txId = req.params.txId;
    var sequence = parseInt(req.params.sequence);
    if (sequence === NaN || sequence < 0) {
        return module.exports.fail(res, 'Seqence number invalid');
    }
    // x-api-key header must be set
    var key = req.headers['x-api-key'];
    if (!key) return module.exports.fail(res, 'X-API-KEY not set', 401);
    if (!txId) return module.exports.fail(res, 'txId field empty');
    if (!sequence) return module.exports.fail(res, 'Sequence field empty');
    // attempting to get a path with also create the path
    // store the partial in /var/asset-data/.partials/email-txId/
    var email;
    var storage = multer.diskStorage({
        destination: function (req, file, callback) {
            var targetPath = path.join(
                conf.storageDir,
                '.partials',
                email + '-' + txId
            );
            callback(null, targetPath);
        },
        filename: function (req, file, callback) {
            callback(null, sequence.toString());
        }
    });
    var params = {key: key};
    // Fetch the team info from the authenticator
    // Any non-201 status suggests that the user does not have access
    // to the asset.
    module.exports.httpPost('authenticator', '/simple', 80, {key: key},
            function(statusCode, data) {
        if (statusCode !== 201) return res.status(statusCode).send(data);
        var info;
        // The authenticator returns some necessary information in a JSON
        // format. If the response is malformed or missing data, the upload
        // will be blocked.
        try {
            info = JSON.parse(data);
        } catch (e) {
            info = undefined;
        }
        if (!info || !info.key) {
            return res.status(statusCode).send(data);
        }
        if (info.key.readonly) {
            return res.status(403).send({error:'Readonly key'});
        }
        email = info.key.creator;
        // the actual upload
        multer({storage}).single('upload')(req, res, function(err) {
            if (err) {
                var errorMsg = {error:'There was an issue uploading the file'};
                return res.status(500).send(errorMsg);
            }
            var fullPath = path.join(req.file.destination, req.file.filename);
            md5(fullPath, (md5err, md5sum)=>{
                if (md5err) {
                    console.error(md5err);
                }
                if (req.headers.accept.toLowerCase() == 'text/plain')
                    res.send(md5sum);
                else res.send({
                    error: md5err || undefined,
                    sequence: req.file.filename,
                    txId: txId,
                    md5: md5sum,
                    user: email
                });
            });
        });
    });
}
