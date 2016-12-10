var fs = require('fs');
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

function getFirstMissing(directory, callback) {
    fs.readdir(directory, (err, items)=>{
        if (err) {
            return callback(err);
        }
        var firstMissing = 0;
        // find first missing index
        while (items.indexOf(firstMissing.toString()) >= 0)
            firstMissing++;
        callback(undefined, firstMissing);
    });
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

module.exports.collate = function(req, res) {
    /* Join file partials together into one asset*/
    var key = req.headers['x-api-key'];
    if (!key)
        return module.exports.fail(res, 'X-API-KEY not set', 401);
    var finalIndex = req.headers['x-final-index'];
    if (!finalIndex)
        return module.exports.fail(res, 'X-FINAL-INDEX not set', 401);
    var assetName = req.headers['x-asset-name'];
    if (!assetName)
        return module.exports.fail(res, 'X-ASSET-NAME not set', 401);
    var versionName = req.headers['x-version-name'];
    if (!versionName)
        return module.exports.fail(res, 'X-ASSET-VERSION not set', 401);
    var filename = req.headers['x-filename'];
    if (!filename)
        return module.exports.fail(res, 'X-FILENAME not set', 401);
    module.exports.httpPost('authenticator', '/simple', 80, {key: key},
            function(statusCode, data) {
        if (statusCode !== 201) return res.status(statusCode).send(data);
        var info;
        try {
            info = JSON.parse(data);
        } catch (e) {
            info = undefined;
        }
        if (info.key.readonly) {
            return res.status(403).send({error:'Readonly key'});
        }
        var team = info.key.team;
        var email = info.key.creator;
        var txId = req.params.txId;
        var partialPath = path.join(
            conf.storageDir,
            '.partials',
            email + '-' + txId
        );
        var assetDirectory = path.join(
            conf.storageDir,
            team,
            assetName,
            versionName
        );
        var assetUpload = path.join(assetDirectory, '__activeUpload');
        var assetDestination = path.join(assetDirectory, filename);
        function appendSegments(index, last, callback) {
            var fileSegment = path.join(partialPath, index.toString());
            fs.readFile(fileSegment, function (err, data) {
                fs.appendFile(assetUpload, data, (err) => {
                    if (err) {
                        callback(err);
                    } else if (index < last) {
                        appendSegments(index+1, last, callback);
                    } else {
                        callback();
                    }
                });
            });
        }
        getFirstMissing(partialPath, (err, firstMissing) => {
            if (err) {
                console.error(err);
                return res.status(500).send(err);
            }
            if ((firstMissing - 1) != parseInt(finalIndex)) {
                var error = 'Missing segment ' + firstMissing;
                return module.exports.fail(res, error, 401);
            }
            mkdirp(assetDirectory, (err) => {
                if (err) return res.status(500).send(err);
                appendSegments(0, firstMissing-1, (err) => {
                    if (err) return res.status(500).send(err);
                    fs.rename(assetUpload, assetDestination, (err) => {
                        if (err) return res.status(500).send(err);
                        md5(assetDestination, (err, sum) => {
                            if (err) return res.status(500).send(err);
                            return res.send({
                                filename: filename,
                                asset: assetName,
                                md5: sum,
                                version: versionName
                            });
                        });
                    });
                });
            });
        });
    });
}

module.exports.next = function(req, res) {
    /* Return the integer of the first missing sequence
    For example, if the entire file is made up of 30 parts, and this
    target returns 31, the file has been completely uploaded.

    If 'Accept: text/plain' is set the result will be a single string
    of the next item in the sequence, otherwise the return format
    will be {"next": <integer>} */
    var key = req.headers['x-api-key'];
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
        if (info.key.readonly) {
            return res.status(403).send({error:'Readonly key'});
        }
        var email = info.key.creator;
        var txId = req.params.txId;
        var targetPath = path.join(
            conf.storageDir,
            '.partials',
            email + '-' + txId
        );
        getFirstMissing(targetPath, (err, firstMissing) => {
            if (err) {
                console.error(err);
                return res.status(500).send(err);
            }
            if (req.headers.accept.toLowerCase() == 'text/plain')
                res.send(firstMissing.toString());
            else
                res.send({next: firstMissing});
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
