var express = require('express');
require('dotenv').config();

var dbauth = {
    account: process.env.CLOUDANT_ACCOUNT,
    username: process.env.CLOUDANT_ACCOUNT,
    poassword: process.env.CLOUDANT_PASSWORD
}

var cloudant;
function connect() {
    require('cloudant')(dbauth, function(err, dbcon) {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        cloudant = dbcon;
    });
}

// establish connection
connect();
// reopen connection every 23 hours
setInterval(connect, 1000 * 60 * 60 * 23);

var app = express();
var PORT = process.env.PORT || 80;

app.get('/', function (req, res) {
    cloudant.db.list(function(err, dbs) {
        res.send({version:'v1.0.0', service:'authenticator', dbs:dbs});
    });
});

app.listen(PORT, function () {
    console.log('Started on port', PORT);
});
