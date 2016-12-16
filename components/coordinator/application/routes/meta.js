var names = require('../lib/names');
var fmt = require('util').format;
var express = require('express');
var router = express.Router();
var auth = require('../lib/auth');
var request = require('request');

// Return whitelist for a specific key/service
router.get('/:service/:assetName/:versionName', auth.verify, function(req, res) {
    var proxy = req.headers['x-for-region'];
    if (proxy) {
        var dest = names.translateGeo(proxy);
        var sReqDetails = {
            url: fmt('https://%s/meta/%s/%s/%s',
                dest,
                req.params.service,
                req.params.assetName,
                req.params.versionName
            ),
            headers: {
                'X-API-KEY': req.keydoc.value
            },
            method: 'GET'
        };
        request(sReqDetails, function(error, sRes, body) {
            if (error)
                return res.status(500).send(error);
            res.send(body);
        });
        return;
    }
    var service = names.translateService(req.params.service);
    if (!service) return res.status(500).send({
        error:req.params.service + ' not recognized'
    });
    var sReqDetails = {
        url: 'http://' + service + '/meta',
        json: {
            asset: req.params.assetName,
            version: req.params.versionName,
            team: req.keydoc.team
        },
        method: 'POST'
    };
    request(sReqDetails, function(error, sRes, body) {
        if (error)
            return res.status(500).send(error);
        res.send(body);
    });
});

router.get('/:service/:team/:asset/:version', auth.verify, function(req, res) {
    // If the team is included, ommit it. This data comes from the key
    var url = fmt('/meta/%s/%s/%s',
        req.params.service,
        req.params.asset,
        req.params.version
    )
    return res.redirect(url);
});

module.exports = router;
