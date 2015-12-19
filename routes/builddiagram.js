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
var reparseCount = 1
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

makeLinks = function makeLinks(newLinks, newFiles, files, moduleInfo, allSourceFiles) {

    _.each(files, function(file) {
        var flags  = moduleFlags(moduleInfo, file.module.name)
        if (flags.ignore)
            return
        var fileSources = file.allSourceFiles()
        _.each(fileSources, function(fileSource) {
            if (!(fileSource.path in allSourceFiles))
                return
            _.each(file.includes(fileSource), function(headerFile) {
                if (!flags.internalLinks && headerFile.module === file.module)
                    return
                var flags2 = moduleFlags(moduleInfo, headerFile.module.name)
                if (flags2.ignore)
                    return
                if (addLink(newLinks, file, headerFile))
                    newFiles[headerFile.path] = headerFile
            })
        })
    })
}

makeLinksFrom = function makeLinksFrom(newLinks, newFiles, files, moduleInfo) {
    _.each(files, function(file) {
        var flags  = moduleFlags(moduleInfo, file.module.name)
        if (flags.ignore)
            return
        var fileSources = file.allSourceFiles()
        _.each(fileSources, function(fileSource) {
            _.each(file.includedFrom(fileSource), function(parentFile) {
                if (!flags.internalLinks && parentFile.module === file.module)
                    return
                var flags2 = moduleFlags(moduleInfo, parentFile.module.name)
                if (flags2.ignore)
                    return
                if (addLink(newLinks, parentFile, file))
                    newFiles[parentFile.path] = parentFile
            })
        })
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
    if (!((q.indep instanceof Array) && (q.outdep instanceof Array) && (q.ignore instanceof Array)))
        return res.status(400).send(new Error('Diagram specification is invalid'))
    var visualizer = validVisualizers[q.visualizer]? q.visualizer: 'dot'
    var edge_length = q.edge_length || 1

    var fileName = visualizer + '-diagram-' + md5(JSON.stringify(q)) + '-' + reparseCount + '.svg'
    var url = '/tmp/' + fileName

    // deBUG, TODO: Uncomment
//    if (knownDiagrams[fileName])
//        return res.send(url)
    knownDiagrams[fileName] = 1

    var data = req.buildInfo.data
    if (!data)
        return res.status(412).send('Build information is not available')
    var indep = dict(q.indep)
    var outdep = dict(q.outdep)
    var ignore = dict(q.ignore)
    var detailed = isTrue(q.detailed)
    var indirect = isTrue(q.indirect)

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
    // _.each(q.indep.concat(q.outdep), function(value) { moduleInfo(value) })
    _.each(q.indep, function(moduleName) { moduleInfo(moduleName).flags.indep = true })
    _.each(q.outdep, function(moduleName) { moduleInfo(moduleName).flags.outdep = true })
    _.each(q.ignore, function(moduleName) { moduleInfo(moduleName).flags.ignore = true })

    // Collect all source files
    var allSourceFiles = _.reduce(q.outdep, function(acc, moduleName) {
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
    var newFilesTo = {}
    var newFilesFrom = {}
    makeLinks(links, newFilesTo, allSourceFiles, allModuleInfo, allSourceFiles)
    makeLinksFrom(links, newFilesFrom, allHeaderFiles, allModuleInfo)
    if (indirect) {
        var veryNewFiles
        while(!_.isEmpty(newFilesTo)) {
            veryNewFiles = {}
            makeLinks(links, veryNewFiles, newFilesTo, allModuleInfo, allSourceFiles)
            newFilesTo = veryNewFiles
        }
        while(!_.isEmpty(newFilesFrom)) {
            veryNewFiles = {}
            makeLinksFrom(links, veryNewFiles, newFilesFrom, allModuleInfo)
            newFilesFrom = veryNewFiles
        }
    }

    // Turn links object into an array of links, each element will be an array [from, to]
    links = _.chain(links).keys().map(function(hash) {
        var parts = hash.split(' -> ')
        var from = data.sourceFiles[parts[0]] || data.headerFiles[parts[0]]
        var to = data.headerFiles[parts[1]]
        return {from: from, to: to}
    }).value()

    _.each(links, function(link) {
        var moduleNameFrom = link.from.module.name
        var moduleNameTo = link.to.module.name
        moduleInfo(moduleNameFrom).links[moduleNameTo] = 1
        moduleInfo(moduleNameTo)
    })
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
            else
                res.send(url)
        })
    })
}
