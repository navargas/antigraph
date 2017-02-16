var express = require('express');
var images = require('../lib/images');
var router = express.Router(); 

router.get('/:teamname', (req, res)=> {
    images.getImageVersions(req.params.teamname, (error, imgVers)=>{
        res.send(imgVers);
    });
});

module.exports = router;
