// var process = require('process')
var path = require('path')
var fs = require('fs')
var _ = require('lodash')
var async = require('async')
var child_process = require('child_process')

function escapeForRegExp(str) {
    return str.replace(/([\\/.+*^$])/g, '\\$1')
}

function clean(collection) {
    _.each(collection, _.method('clean'))
}

var runningStatus
;(function() {

function RunningStatusData(options) {
    _.extend(this, {
        status: 'ready',
        progress: 1
    })
    if (options)
        _.extend(this, options)
}

var runningStatusData = new RunningStatusData()
var sourceFilesTotal
var sourceFilesProcessed

runningStatus = function() {
    return runningStatusData
}

runningStatus.start = function()
{
    runningStatusData = new RunningStatusData({
        status: 'reading',
        progress: 0
    })
}

runningStatus.announceSourceFiles = function(data)
{
    sourceFilesTotal = _.size(data.sourceFiles)
    sourceFilesProcessed = 0
    runningStatusData = new RunningStatusData({
        status: 'extracting',
        progress: 0
    })
}

runningStatus.sourceFileProcessed = function()
{
    if (++sourceFilesProcessed === sourceFilesTotal) {
        runningStatusData = new RunningStatusData({
            status: 'processing',
            progress: 1
        })
    }
    else
        runningStatusData.progress = sourceFilesProcessed / sourceFilesTotal
}

runningStatus.finished = function(err) {
    if (err)
        runningStatusData = new RunningStatusData({
            status: 'failed',
            progress: 1,
            error: err
        })
    else
        runningStatusData = new RunningStatusData()
}

})()

function Data(options) {
    this.options = options
    this.modules = {}
    this.sourceFiles = {}
    this.headerFiles = {}
}

Data.prototype.module = function(moduleName) {
    if (!this.modules[moduleName])
        this.modules[moduleName] = new Module({data: this, name: moduleName})
    return this.modules[moduleName]
}

Data.prototype.sourceFile = function(filePath) {
    var sourceFile = this.sourceFiles[filePath]
    if (sourceFile)
        return sourceFile
    var o = this.options
    var info = o.parseSourceFilePath(filePath, o.srcRootPath, o.buildPath)
    sourceFile = this.sourceFiles[filePath] = new SourceFile({
        data: this,
        path: filePath,
        name: info.name,
        module: this.module(info.module),
        repo: info.repo
    })
    if (!sourceFile.module.path) {
        _.extend(sourceFile.module, {
            path: info.modulePath,
            repo: info.repo
        })
    }
    else if (sourceFile.module.path !== info.modulePath)
        throw new Error('Different paths for module:\n' + sourceFile.module.path + '\n' + info.modulePath)
    sourceFile.module.sourceFiles.push(sourceFile)
    return sourceFile
}

Data.prototype.headerFile = function(filePath) {
    var headerFile = this.headerFiles[filePath]
    if (headerFile)
        return headerFile
    var o = this.options
    var info = o.parseHeaderFilePath(filePath, o.srcRootPath, o.buildPath)
    if (!info.module)
        info.module = 'third_party'
    var module = this.module(info.module)
    headerFile = this.headerFiles[filePath] = new HeaderFile({
        data: this,
        path: filePath,
        name: info.name,
        module: module
    })
    if (info.repo)
        module.repo = info.repo
    if (info.modulePath) {
        if (!module.path)
            module.path = info.modulePath
        else if (module.path !== info.modulePath)
            throw new Error('Different paths for module:\n' + module.path + '\n' + info.modulePath)
    }
    module.headerFiles.push(headerFile)
    return headerFile
}

Data.prototype.addLink = function(sourceFile, fromPath, toPath) {
    var from = sourceFile.path === fromPath ?   sourceFile :   this.headerFile(fromPath)
    var to = this.headerFile(toPath)
    from.addInclude(to, sourceFile)
    to.addIncludedFrom(from, sourceFile)
}

// Prepare for re-scanning include dependencies
Data.prototype.clean = function() {
    clean(this.modules)
    clean(this.sourceFiles)
    this.headerFiles = {}
}



function Module(options) {
    this.sourceFiles = []
    this.headerFiles = []
    if (options)
        _.extend(this, options)
}

// Prepare for re-scanning include dependencies
Module.prototype.clean = function() {
    this.headerFiles = []
}



function SourceFile(options) {
    this.links = {}
    if (options)
        _.extend(this, options)
}
SourceFile.prototype.includedFrom = function() {
    return {}
}
SourceFile.prototype.allSourceFiles = function() {
    return [this]
}
SourceFile.prototype.includes = function() {
    return this.links
}
SourceFile.prototype.addInclude = function(headerFile) {
    this.links[headerFile.path] = headerFile
}

// Prepare for re-scanning include dependencies
SourceFile.prototype.clean = function() {
    this.links = {}
}



function HeaderFile(options) {
    this.links = {}
    this.backLinks = {}
    if (options)
        _.extend(this, options)
}
HeaderFile.prototype.includedFrom = function(sourceFile) {
    return this.backLinks[sourceFile.path] || {}
}
HeaderFile.prototype.allSourceFiles = function() {
    var sourceFiles = this.data.sourceFiles
    return _.map(this.backLinks, function(value, key) {
        return sourceFiles[key]
    })
}

HeaderFile.prototype.includes = function(sourceFile) {
    return this.links[sourceFile.path] || {}
}
HeaderFile.prototype.addInclude = function(headerFile, sourceFile) {
    var links = this.links[sourceFile.path]
    if (!links)
        links = this.links[sourceFile.path] = {}
    links[headerFile.path] = headerFile
}
HeaderFile.prototype.addIncludedFrom = function(file, sourceFile) {
    var links = this.backLinks[sourceFile.path]
    if (!links)
        links = this.backLinks[sourceFile.path] = {}
    links[file.path] = file
}

// Prepare for re-scanning include dependencies
HeaderFile.prototype.clean = function() {
    this.links = {}
    this.backLinks = {}
}



function parseBuildLog(options, cb)
{
    runningStatus.start()
    options = options || {}
    if (!(options.ignoreSourceFilePath instanceof Function))
        options.ignoreSourceFilePath = function() {}
    var buildPath = options.buildPath
    var srcRootPath = options.srcRootPath
    var CXX = options.CXX || '/usr/bin/c++'

    var data = new Data(options)

    function parseSource(line) {
        var lineData = { defines: [], includes: [], otherFlags: [] }
        _.each(line.split('&&'), function(command) {
            command = command.trim()
            var parts = command.split(/\s+/) // TODO better (quoted spaces)
            if (parts[0] !== CXX)
                return
            parts.splice(0, 1)
            _.each(parts, function(part, ipart) {
                if (part[0] === '-') {
                    if (part.match(/^-D/))
                        lineData.defines.push(part)
                    else if(part.match(/^-I/))
                        lineData.includes.push(part)
                    else if(part.match(/^(-std)/))
                        lineData.otherFlags.push(part)
                }
                else if (ipart > 0 && parts[ipart-1].substr(0,2) === '-i')
                    lineData.otherFlags.push(parts[ipart-1] + ' ' + part)
                else if (parts[ipart-1] !== '-o') {
                    if (lineData.filePath)
                        return cb(new Error('Failed to parse line - multiple source file name specification\n' + line))
                    lineData.filePath = part
                }
            })
        })
        if (!lineData.filePath)
            return cb(new Error('Failed to parse line - no source file name specification\n' + line))
        if (options.ignoreSourceFilePath(lineData.filePath, srcRootPath, buildPath))
            return
        data.sourceFile(lineData.filePath).cmd = [CXX,
              lineData.defines.join(' '),
              lineData.includes.join(' '),
              lineData.otherFlags.join(' '),
              '-H -M',
              lineData.filePath
        ].join(' ')
    }
    function parseModule(line, type, nameFunc) {
        var name
        _.each(line.split('&&'), function(command) {
            command = command.trim()
            var parts = command.split(/\s+/) // TODO better (quoted spaces)
            if (parts[0] !== CXX)
                return
            parts.splice(0, 1)
            _.each(parts, function(part, ipart) {
                if (part !== '-'   &&   parts[ipart-1] === '-o') {
                    if (name)
                        return cb(new Error('Failed to parse line - multiple module name specification\n' + line))
                    name = nameFunc(part)
                    if (!name)
                        return cb(new Error('Failed to parse line - invalid module name specification\n' + line))
                }
            })
        })
        _.extend(data.module(name), {type: type, built: true})
    }
    function parseSoModule(line) {
        parseModule(line, 'library', function(part) {
            var m = part.match(/lib([^\/]+)\.so$/)
            if (m)
                return m[1]
        })
    }
    function parseExecutableModule(line) {
        parseModule(line, 'application', function(part) {
            var m = part.match(/([^\/]+)$/)
            if (m)
                return m[1]
        })
    }

    // Read build log
    var rxBegin = escapeForRegExp(CXX) + '\\s+.*-o\\s+[.\\/a-zA-Z0-9_-]+'
    var rxCompile = new RegExp(rxBegin + '\\.(cpp|cc|c|cxx)\\.o')
    var rxLinkSo = new RegExp(rxBegin + '\\.so')
    var rxLinkExecutable = new RegExp(rxBegin)
    var buildLogFileName = path.join(buildPath, 'buildlog.txt')
    _.each(fs.readFileSync(buildLogFileName, 'utf8').split('\n'), function(line) {
        if (line.match(rxCompile))
            parseSource(line)
        else if (line.match(rxLinkSo))
            parseSoModule(line)
        else if (line.match(rxLinkExecutable))
            parseExecutableModule(line)
    })

    cb(null, data)
}

function extractIncludeDependencies(data, cb)
{
    runningStatus.announceSourceFiles(data)
    function extractSourceDependencies(sourceFile, cb)
    {
        child_process.exec(sourceFile.cmd, {encoding: 'utf8'}, function (error, stdout, stderr) {
            runningStatus.sourceFileProcessed()
            if (error)
                return cb(error)
            var done = false
            var stack = [sourceFile.path]
            _.each(stderr.split('\n'), function(line) {
                if (done)
                    return
                if (line[0] !== '.') {
                    done = true
                    return
                }
                var m = line.match(/^(\.+)\s+(.+)$/)
                if (!m)
                    throw new Error('Unexpected g++ output (syntax)')
                var n = m[1].length
                var from = stack[n-1],   to = path.normalize(m[2])
                if (!from)
                    throw new Error('Unexpected g++ output (depth)')
                stack[n] = to
                if (stack.length > n+1)
                    stack.splice(n+1, stack.length-n)
                data.addLink(sourceFile, from, to)
            })
            cb()
        })
    }

    async.parallelLimit(
        _.map(
            data.sourceFiles,
            function(sourceFile) {
                return extractSourceDependencies.bind(null, sourceFile)
            }),
        10,
        function(err) {
            cb(err, data)
        }
    )
}

function removeDummyModules(data, cb) {
    // Remove modules that have no source files and no header files
    data.modules = _.pick(data.modules, function(module) {
        return !(
            _.isEmpty(module.sourceFiles)   &&
            _.isEmpty(module.headerFiles))
    })
    cb(null, data)
}

function sortModules(data, cb) {
    data.sortedModules = _.sortBy(data.modules, 'name')
    cb(null, data)
}

function reportDone(data, cb) {
    console.log('Codebase dependencies have been parsed')
    cb(null, data)
}

makeBuildDependencies.readBuildLogFile = function(options, cb)
{
    if (runningStatus().status !== 'ready')
        return cb(new Error('Dependency generator is busy'))
    parseBuildLog(options, function(err, data) {
        if (err) {
            console.log(err)
            return cb(err)
        }
        else {
            console.log('Build log file has been read')
            return cb(null, data)
        }
    })
}

makeBuildDependencies.makeDependencies = function(data, cb)
{
    if (runningStatus().status !== 'ready')
        return cb(new Error('Dependency generator is busy'))

    // Prepare for re-scanning include dependencies
    data.clean()

    // Scan dependencies
    async.waterfall([
                        extractIncludeDependencies.bind(null, data),
                        removeDummyModules,
                        sortModules,
                        reportDone
                    ],
                    function(err, data) {
                        runningStatus.finished(err)
                        cb(err, data)
                    })
}

makeBuildDependencies.status = runningStatus

function makeBuildDependencies(options, cb)
{
    if (runningStatus().status !== 'ready')
        return cb(new Error('Dependency generator is busy'))
    async.waterfall([
                        parseBuildLog.bind(null, options),
                        extractIncludeDependencies,
                        removeDummyModules,
                        sortModules,
                        reportDone
                    ],
                    function(err, data) {
                        runningStatus.finished(err)
                        cb(err, data)
                    })
}

module.exports = makeBuildDependencies
