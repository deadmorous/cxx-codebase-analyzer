var path = require('path')
var projdep = require('./projdep.js')
var _ = require('lodash')

function startsWith(what, withWhat) {
    return what.substr(0, withWhat.length) === withWhat
}

var buildInfo = {
    options: require('./build_options.js')
}

var computingProjDepData

module.exports = function(req, res, next) {
    req.buildInfo = buildInfo
    if (!computingProjDepData && !buildInfo.data) {
        computingProjDepData = true
        projdep(buildInfo.options, function(err, data) {
            if (err)
                throw err   // BUG, TODO
            buildInfo.data = data
            computingProjDepData = false
        })
    }
    next()
}
