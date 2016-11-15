var fmt = require('util').format;

module.exports.getServices = function() {
    var services = [];
    if (process.env.SERVICES)
        services = process.env.SERVICES.split('+');
    var result = services.map((o) => o.split('/'));
    return result;
};

module.exports.getGeo = function() {
    var geo = [];
    if (process.env.GEO)
        geo = process.env.GEO.split('+');
    for (var ix in geo) {
        geo[ix] = geo[ix].split('/');
    }
    return geo;
};

/* valid matches include strings that share the same initial letters
   for example "Docker Registry" is matched by "Docker" and "docker"
   and "Binary Assets" is matched by "bin" and "binary" */
module.exports.translateService = function(display, reverse) {
    var services = module.exports.getServices();
    var nameMatch = RegExp(fmt('^%s.*', display), 'i');
    var source = reverse ? 0 : 1
    var target = reverse ? 1 : 0
    for (var ix in services) {
        var full = services[ix][source];
        if (nameMatch.test(full)) return services[ix][target];
    }
}

module.exports.translateGeo = function(display) {
    var geo = module.exports.getGeo();
    for (var ix in geo) {
        if (geo[ix][1] == display) return geo[ix][0];
    }
}
