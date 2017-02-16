var http = require('http');

function getTags(imageName, callback) {
    var buffer = '';
    var httpReq = {
        hostname: 'registry',
        port: 5000,
        method: 'GET',
        path: '/v2/'+imageName+'/tags/list'
    };
    var getreq = http.request(httpReq, function(getres) {
        getres.setEncoding('utf8');
        getres.on('data', function(chunk) {
            buffer += chunk;
        });
        getres.on('end', function() {
            var data;
            try {
                data = JSON.parse(buffer);
            } catch (e) {
                console.error(e);
            }
            if (callback) callback(data.tags);
        })
    });
    getreq.end();
}

function getTagInfo(images, callback) {
    if (images.length === 0) {
        if (callback) callback([]);
    }
    var result = [];
    for (var index in images) {
        var img = images[index];
        (function (img) {getTags(img, function(versions) {
            result.push({name:img, versions:versions});
            if (result.length == images.length) {
                if (callback) callback(result);
            }
        })})(img);
    }
}

module.exports.getImageVersions = function(teamname, callback) {
    var all = (teamname === undefined);
    var team = teamname + '/';
    var buffer = '';
    var httpReq = {
        hostname: 'registry',
        port: 5000,
        method: 'GET',
        path: '/v2/_catalog?n=10000'
    };
    var getreq = http.request(httpReq, function(getres) {
        getres.setEncoding('utf8');
        getres.on('data', function(chunk) {
            buffer += chunk;
        });
        getres.on('end', function() {
            var imageList;
            var error;
            try {
                var list = JSON.parse(buffer).repositories;
                if (all) {
                    imageList = list;
                } else {
                    imageList = list.filter(
                        (i) => {return i.indexOf(team) == 0});
                }
            } catch(e) {
                console.error(e);
                error = e;
            }
            getTagInfo(imageList, function(imageVersions) {
                imageVersions = imageVersions.filter(
                    (i) => {return i.versions !== null});
                callback(error, imageVersions);
            });
        })
    });
    getreq.end();
}
