var cloudant;
var DBNAME = 'antigraph';
require('dotenv').config();

var dbauth = {
    account: process.env.CLOUDANT_ACCOUNT,
    username: process.env.CLOUDANT_ACCOUNT,
    password: process.env.CLOUDANT_PASSWORD
}
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

module.exports = function() {return cloudant.use(DBNAME);};
