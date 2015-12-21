var path = require('path')
var _ = require('lodash')
var child_process = require('child_process')
var fs = require('fs')
var crypto = require('crypto')

function md5(text) {
    return crypto.createHash('md5').update(text).digest('hex')
}

function dict(stringArray) {
    var result = {}
    _.each(stringArray, function(s) { result[s] = 1 })
    return result
}

var knownDiagrams = {}
var validVisualizers = {
    dot: 1,
    neato: 1,
    fdp: 1,
    sfdp: 1,
    twopi: 1,
    circo: 1
}

var makeLinks, makeLinksFrom
;(function() {

function moduleFlags(moduleInfo, moduleName) {
    var minfo = moduleInfo[moduleName]
    return minfo ?   minfo.flags :   {}
}

function addLink(links, from, to) {
    var hash = from.path + ' -> ' + to.path
    if (links[hash])
        return false
    links[hash] = 1
    return true
}

function traceDependencies(newLinks, moduleInfo, file, options, data) {
    var flagsFrom = moduleFlags(moduleInfo, file.module.name)
    if (flagsFrom.ignore)
        return
    options = options || {}
    data = data || {
        sourceFile: file,
        allFiles: {}
    }
    if (data.allFiles[file.path])
        return
    data.allFiles[file.path] = file
    var sourceFlags = moduleFlags(moduleInfo, data.sourceFile.module.name)
    _.each(file.includes(data.sourceFile), function(headerFile) {
        var flagsTo = moduleFlags(moduleInfo, headerFile.module.name)
        if (flagsTo.ignore)
            return
        var gone = data.sourceFile.module !== file.module
        var transit = gone && file.module !== headerFile.module
        var inModule = data.sourceFile.module === headerFile.module
        var needLink, needRecursion
        if (inModule) {
            needLink = sourceFlags.internal
            needRecursion = sourceFlags.outdep || sourceFlags.internal
        }
        else if (transit)
            needLink = needRecursion = options.indirect
        else if (gone) {
            needLink = false
            needRecursion = options.indirect
        }
        else {
            needLink = sourceFlags.outdep
            needRecursion = sourceFlags.outdep && options.indirect
        }
        if (needLink)
            addLink(newLinks, file, headerFile)
        if (needRecursion)
            traceDependencies(newLinks, moduleInfo, headerFile, options, data)
    })
}

makeLinks = function makeLinks(newLinks, moduleInfo, allSourceFiles, options) {
    _.each(allSourceFiles, function(sourceFile) {
        traceDependencies(newLinks, moduleInfo, sourceFile, options)
    })
}

function traceBackDependencies(newLinks, moduleInfo, file, options, data) {
    var flagsTo = moduleFlags(moduleInfo, file.module.name)
    if (flagsTo.ignore)
        return
    options = options || {}
    data = data || {
        allFiles: {},
        originalFile: file
    }
    if (data.allFiles[file.path])
        return
    data.allFiles[file.path] = file
    _.each(file.allSourceFiles(), function(fileSource) {
        _.each(file.includedFrom(fileSource), function(parentFile) {
            var flagsFrom = moduleFlags(moduleInfo, parentFile.module.name)
            if (flagsFrom.ignore)
                return
            var needRecursion
            if (parentFile.module !== file.module)
                addLink(newLinks, parentFile, file)
            if (parentFile.module !== data.originalFile.module)
                needRecursion = options.indirect
            else
                needRecursion = true
            if (needRecursion)
                traceBackDependencies(newLinks, moduleInfo, parentFile, options, data)
        })
    })
}

makeLinksFrom = function makeLinksFrom(newLinks, moduleInfo, headerFiles, options) {
    _.each(headerFiles, function(headerFile) {
        traceBackDependencies(newLinks, moduleInfo, headerFile, options)
    })
}

})()

function isTrue(value) {
    return value === true || value === 'true'
}

module.exports = function(req, res, next) {
    var q = req.query
    if (!(q instanceof Object))
        return res.status(400).send('Diagram specification is invalid or missing')
    q.indep = q.indep || []
    q.outdep = q.outdep || []
    q.ignore = q.ignore || []
    q.internal = q.internal || []
    if (!((q.indep instanceof Array) && (q.outdep instanceof Array) && (q.ignore instanceof Array) && (q.internal instanceof Array)))
        return res.status(400).send(new Error('Diagram specification is invalid'))
    var visualizer = validVisualizers[q.visualizer]? q.visualizer: 'dot'
    var edge_length = q.edge_length || 1

    var data = req.buildInfo.data
    if (!data)
        return res.status(412).send('Build information is not available')

    var fileName = visualizer + '-diagram-' + md5(JSON.stringify(q) + data.scanDate) + '.svg'
    var url = '/tmp/' + fileName

    var allModuleInfo = {}
    function moduleInfo(moduleName) {
        var result = allModuleInfo[moduleName]
        if (!result)
            result = allModuleInfo[moduleName] = {
                links: {},
                nodes: {},
                flags: {}
            }
        return result
    }
    _.each(q.indep, function(moduleName) { moduleInfo(moduleName).flags.indep = true })
    _.each(q.outdep, function(moduleName) { moduleInfo(moduleName).flags.outdep = true })
    _.each(q.ignore, function(moduleName) { moduleInfo(moduleName).flags.ignore = true })
    _.each(q.internal, function(moduleName) { moduleInfo(moduleName).flags.internal = true })

    // Collect all source files
    var allSourceFiles = _.reduce(q.outdep.concat(q.internal), function(acc, moduleName) {
        var module = data.module(moduleName)
        if (!moduleInfo(moduleName).flags.ignore)
            _.each(module.sourceFiles, function(sourceFile) {
                acc[sourceFile.path] = sourceFile
            })
        return acc
    }, {})

    // Collect all header files
    var allHeaderFiles = _.reduce(q.indep, function(acc, moduleName) {
        var module = data.module(moduleName)
        _.each(module.headerFiles, function(headerFile) {
            acc[headerFile.path] = headerFile
        })
        return acc
    }, {})

    // Generate all links between files
    var links = {}
    var options = { indirect: isTrue(q.indirect) }
    makeLinks(links, allModuleInfo, allSourceFiles, options)
    makeLinksFrom(links, allModuleInfo, allHeaderFiles, options)

    // Turn links object into an array of links, each element will be an array [from, to]
    links = _.chain(links).keys().map(function(hash) {
        var parts = hash.split(' -> ')
        var from = data.sourceFiles[parts[0]] || data.headerFiles[parts[0]]
        var to = data.headerFiles[parts[1]]
        return {from: from, to: to}
    }).value()

    // Generate module links, which will ensure that all involved modules are in allModuleInfo
    _.each(links, function(link) {
        var moduleNameFrom = link.from.module.name
        var moduleNameTo = link.to.module.name
        moduleInfo(moduleNameFrom).links[moduleNameTo] = 1
        moduleInfo(moduleNameTo)
    })

    // Compute the resulting object for the request
    var result = {
        url: url,
        modules: _.reduce(allModuleInfo, function(acc, minfo, name) {
            if (!minfo.flags.ignore)
                acc.push(name)
            return acc
        }, [])
    }

    // deBUG: comment out to disable the use of cached diagrams
    if (knownDiagrams[fileName])
        return res.send(result)

    var detailed = isTrue(q.detailed)
    if (detailed) {
        // Compute file hash, based on linked files
        var fileInfo = _.reduce(links, function(acc, link){
            function updateFileInfo(file, linkedFile, to) {
                var info = acc[file.path]
                if (!info)
                    info = acc[file.path] = {
                        file: file,
                        hash: crypto.createHash('md5').update(file.module.name)
                    }
                info.hash.update((to? 'to:': 'from:') + linkedFile.path)
            }
            updateFileInfo(link.from, link.to, false)
            updateFileInfo(link.to, link.from, true)
            return acc
        }, {})

        // Turn hash objects into string values (node names);
        // generate list of files in each node
        _.each(fileInfo, function(info) {
            var hash = info.hash = 'node_' + info.hash.digest('hex')
            var nodes = moduleInfo(info.file.module.name).nodes
            var nodeFiles = nodes[hash]
            if (!nodeFiles)
                nodeFiles = nodes[hash] = []
            nodeFiles.push(info.file)
        })

        // Generate grouped links
        var groupedFileLinks = _.reduce(links, function(acc, link) {
            var hfrom = fileInfo[link.from.path].hash
            var hto = fileInfo[link.to.path].hash
            acc[hfrom + ' -> ' + hto] = 1
            return acc
        }, {})
    }

    var g = []
    g.push('digraph g {')
    g.push('concentrate=true;')
    g.push('overlap=false;')
    if (visualizer === 'dot')
        g.push('ranksep=' + 0.75*edge_length + ';')
    else
        g.push('edge [len=' + edge_length + ']')
    _.each(allModuleInfo, function(minfo, moduleName) {
        if (minfo.flags.ignore)
            return
        var line
        var module = data.modules[moduleName]
        if (detailed) {
            line = 'subgraph cluster_' + moduleName + '{\n' +
                    'color=' + (module.built? '"0.3,0.3,1"': '"0.8,0.1,1"') + ';\n' +
                    'style=filled;\n' +
                    'label="'+moduleName+'";\n'
            if (_.isEmpty(minfo.nodes))
                line += moduleName + '_dummy_nodes [label="<no nodes>"]'
            else
                line += _.map(minfo.nodes, function(nodeFiles, nodeName) {
                    var label = _.map(nodeFiles, 'name').join('\\n')
                    return nodeName + ' [label="' + label + '"]'
                }).join('\n')
            line += '}\n'
        }
        else {
            line = moduleName
            if (!module.built)
                line += ' [style=filled, color="0.8,0.1,1"]'
        }
        g.push(line)
    })
    if (detailed)
        g.push(_.keys(groupedFileLinks).join('\n'))
    else
        _.each(allModuleInfo, function(minfo, moduleName) {
            _.each(_.keys(minfo.links), function(linkedModuleName) {
                g.push(moduleName + ' -> ' + linkedModuleName)
            })
        })
    g.push('}')
    var dir = path.join(__dirname, '../tmp')
    var filePath = path.join(dir, fileName)
    var dotFileName = fileName.replace(/(\.svg)?$/, '.dot')
    var dotFilePath = path.join(dir, dotFileName)
    fs.writeFile(dotFilePath, g.join('\n'), 'utf8', function(err) {
        if (err)
            return res.status(500).send(err + '\nFailed to write file')
        child_process.exec(visualizer + ' -Tsvg -o ' + filePath + ' ' + dotFilePath, {encoding: 'utf8'}, function (error, stdout, stderr) {
            if (error) {
                res.status(500).send(error + '\n' + stderr)
                console.log(err)
                console.log(stderr)
            }
            else {
                knownDiagrams[fileName] = 1
                res.send(result)
            }
        })
    })
}
