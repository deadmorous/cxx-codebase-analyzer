var path = require('path')
var projdep = require('./projdep.js')
var _ = require('lodash')

function startsWith(what, withWhat) {
    return what.substr(0, withWhat.length) === withWhat
}

var ctmdevOptions = {
    CXX: '/usr/bin/c++',
    buildPath: path.resolve(process.env.BUILDDIR),
    srcRootPath: path.resolve(process.env.SRCDIR),
    ignoreSourceFilePath: function(filePath, srcRootPath, buildPath) {
        return !startsWith(filePath, srcRootPath)
    },
    parseSourceFilePath: function(filePath, srcRootPath, buildPath)
    {
        var parts = filePath.split(path.sep)
        var n = parts.length - 5
        if (n < 0)
            throw new Error('Unable to parse source file name ' + filePath + ' - too few parts in path')
        return {
            repo: parts[n],
            module: parts[n+2],
            modulePath: parts.slice(0, n+3).join('/'),
            name: parts[n+4]
        }
    },
    parseHeaderFilePath: function(filePath, srcRootPath, buildPath)
    {
        var inSourcePath = startsWith(filePath, srcRootPath)
        var parts = filePath.split(path.sep)
        var info = {
            name: parts.slice(-1)[0]
        }
        if (inSourcePath) {
            var n = _.findLastIndex(parts, function(part) { return part === 'modules'} )
            if (n <= 0)
                return info
            _.extend(info, {
                repo: parts[n-1],
                module: parts[n+1],
                modulePath: parts.slice(0, n+2).join('/')
            })
        }
        return info
    }
}

var tdcBuildInfoParam = {
    CXX: '/usr/bin/c++',
    buildPath: path.resolve(process.env.BUILDDIR),
    srcRootPath: path.resolve(process.env.SRCDIR),
    ignoreSourceFilePath: function(filePath, srcRootPath, buildPath) {
        if (!startsWith(filePath, srcRootPath))
            // Ignore generated files
            return true
        var parts = filePath.split(path.sep)
        if (parts.length < 2)
            // Ignore paths consisting of just one part
            return true
        var n = _.findLastIndex(parts, function(part) { return part === 'modules'} )
        if (n < 0)
            // Ignore sources from non-modules
            return true
        if (n+3 !== parts.length)
            // Ignore sources nested deeper than expected (those are actually tests)
            return true
    },
    parseSourceFilePath: function(filePath, srcRootPath, buildPath) {
        var parts = filePath.split(path.sep)
        if (parts.length < 2)
            throw new Error('Unable to parse source file name ' + filePath + ' - too few parts in path')
        var info = {
            name: parts.slice(-1)[0]
        }
        var n = _.findLastIndex(parts, function(part) { return part === 'modules'} )
        if (n >= 0)
            _.extend(info, {
                module: parts[n+1],
                modulePath: parts.slice(0, n+2).join('/')
            })
        return info
    },
    parseHeaderFile: function(filePath, srcRootPath, buildPath)
    {
        var inSourcePath = startsWith(filePath, srcRootPath)
        var parts = filePath.split(/\\|\//)
        var info = {
            name: parts.slice(-1)[0]
        }
        if (inSourcePath) {
            var nx = _.findLastIndex(parts, function(part) {
                return part === 'external'
            })
            var n = _.findLastIndex(parts, function(part) {
                return part === 'modules'   ||   part === 'include'
            })
            if (n < 0 || (nx > 0 && nx < n))
                return info
            parts[n] = 'modules'
            _.extend(info, {
                module: parts[n+1],
                modulePath: parts.slice(0, n+2).join('/')
            })
        }
        return info
    }
}

var buildInfo = {
    options: ctmdevOptions
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
