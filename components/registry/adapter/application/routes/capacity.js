var express = require('express');
var blobs = require('../lib/blobs');
var router = express.Router(); 

router.get('/:teamname', (req, res)=> {
    blobs.byTeam(req.params.teamname, (err, array) => {
        if (err) {
            res.status(500).send(err);
            console.error(err);
        } else {
            res.send(array);
        }
    });
});

module.exports = router;
