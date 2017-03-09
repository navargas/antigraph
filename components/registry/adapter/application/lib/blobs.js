var request = require('request');
var images = require('../lib/images');
var fmt = require('util').format;

function formUniqueArray(target, newItems) {
    for (let item of newItems) {
        if (target.indexOf(item) < 0) {
            target.push(item);
        }
    }
}

/*
blobByTeam(teamname, callback)

Get a list of all blobs owned by a team
callback(err, array)
*/
module.exports.byTeam = function(teamname, callback) {
    var server = "http://registry:5000";
    var urls = [];
    var blobs = [];
    images.getImageVersions(teamname, (error, imgVers) => {
        // Loop over all versions
        for (let img of imgVers) for (let version of img.versions) {
            var url = fmt("%s/v2/%s/manifests/%s", server, img.name, version);
            urls.push(url);
        }
        var responses = 0;
        var lastError;
        var headers = {
            'Accept':'application/vnd.docker.distribution.manifest.v2+json'
        };
        for (let url of urls) {
            request({url, headers}, (err, response, body)=>{
                responses++;
                if (err) {
                    console.error(err);
                    lastError = err;
                } else {
                    var result = JSON.parse(body);
                    console.log(result);
                    formUniqueArray(blobs, result.layers.map(o=>o.digest));
                }
                if (responses == urls.length && callback) {
                    callback(lastError, blobs);
                }
            });
        }
    });
}
