/* eslint-disable no-console, no-undef, no-var, one-var, import/no-commonjs*/

const path = require('path');
// const sanitizeFilename = require('sanitize-filename');

function normalizeJsName(value) {
    return value.trim().replace('-', '_').replace(' ', '_');
}

// var truncate = require('truncate-utf8-bytes');

function isHighSurrogate(codePoint) {
    return codePoint >= 0xd800 && codePoint <= 0xdbff;
}

function isLowSurrogate(codePoint) {
    return codePoint >= 0xdc00 && codePoint <= 0xdfff;
}

// Truncate string by size in bytes
function truncate(getLength, string, byteLength) {
    if(typeof string !== 'string') {
        throw new Error('Input must be string');
    }

    var charLength = string.length;
    var curByteLength = 0;
    var codePoint;
    var segment;

    for(var i = 0; i < charLength; i += 1) {
        codePoint = string.charCodeAt(i);
        segment = string[i];

        if(isHighSurrogate(codePoint) && isLowSurrogate(string.charCodeAt(i + 1))) {
            i += 1;
            segment += string[i];
        }

        curByteLength += getLength(segment);

        if(curByteLength === byteLength) {
            return string.slice(0, i + 1);
        } else if(curByteLength > byteLength) {
            return string.slice(0, i - segment.length + 1);
        }
    }

    return string;
}


// eslint-disable-next-line no-useless-escape
var illegalRe = /[\/\?<>\\:\*\|"]/g;
// eslint-disable-next-line no-control-regex
var controlRe = /[\x00-\x1f\x80-\x9f]/g;
var reservedRe = /^\.+$/;
var windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
// eslint-disable-next-line no-useless-escape
var windowsTrailingRe = /[\. ]+$/;

function sanitize(input, replacement) {
    if(typeof input !== 'string') {
        throw new Error('Input must be string');
    }
    var sanitized = input
        .replace(illegalRe, replacement)
        .replace(controlRe, replacement)
        .replace(reservedRe, replacement)
        .replace(windowsReservedRe, replacement)
        .replace(windowsTrailingRe, replacement);
    return truncate(sanitized, 255);
}

function processFile(file, options, callback) {
    const sanitizedFile = sanitize(file);
    const name = path.basename(sanitizedFile, path.extname(sanitizedFile));

    options.info('%s: started', name);

    parse(sanitizedFile, { precision: options.precision }, function(shapeData, errors) {
        let content;
        options.info('%s: finished', name);

        if(errors) {
            errors.forEach(function(e) {
                options.error('  ' + e);
            });
        }

        if(shapeData) {
            content = JSON.stringify(options.processData(shapeData), null, options.isDebug ? 4 : undefined);

            if(!options.isJSON) {
                content = options.processFileContent(content, normalizeJsName(name));
            }

            const outputDir = path.resolve(options.output || path.dirname(sanitizedFile));
            const safePath = path.resolve(outputDir, options.processFileName(name + (options.isJSON ? '.json' : '.js')));

            // Validate that the safePath is within the outputDir
            const relativePath = path.relative(outputDir, safePath);
            if(relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                options.error('Attempt to write outside the allowed directory');
                return callback();
            }

            fs.writeFile(sanitize(safePath), content, function(e) {
                if(e) {
                    options.error('  ' + e.message);
                }
                callback();
            });
        } else {
            callback();
        }
    });
    // const sanitizedFile = sanitizeFilename(file);
    // var name = path.basename(sanitizedFile, path.extname(sanitizedFile));
    // options.info('%s: started', name);
    // parse(sanitizedFile, { precision: options.precision }, function(shapeData, errors) {
    //     var content;
    //     options.info('%s: finished', name);
    //     errors && errors.forEach(function(e) {
    //         options.error('  ' + e);
    //     });
    //     if(shapeData) {
    //         content = JSON.stringify(options.processData(shapeData), null, options.isDebug && 4);
    //         if(!options.isJSON) {
    //             content = options.processFileContent(content, normalizeJsName(name));
    //         }

    //         const outputDir = path.resolve(options.output || path.dirname(sanitizedFile));
    //         const safePath = path.resolve(outputDir, options.processFileName(name + (options.isJSON ? '.json' : '.js')));

    //         const relativePath = path.relative(outputDir, safePath);
    //         if(relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    //             options.error('Attempt to write outside the allowed directory');
    //             return callback();
    //         }

    //         fs.writeFile(safePath, content, function(e) {
    //             e && options.error('  ' + e.message);
    //             callback();
    //         });
    //     } else {
    //         callback();
    //     }
    // });
}

function collectFiles(dir, done) {
    var input = path.resolve(dir || '');
    fs.stat(input, function(e, stat) {
        if(e) {
            done(e, []);
        } else if(stat.isFile()) {
            done(null, checkFile(input) ? [path.resolve(path.dirname(input), normalizeFile(input))] : []);
        } else if(stat.isDirectory()) {
            fs.readdir(input, function(e, dirItems) {
                var list = [];
                dirItems.forEach(function(dirItem) {
                    if(checkFile(dirItem)) {
                        list.push(path.resolve(input, normalizeFile(dirItem)));
                    }
                });
                done(null, list);
            });
        } else {
            done(null, []);
        }
    });

    function checkFile(name) {
        return path.extname(name).toLowerCase() === '.shp';
    }

    function normalizeFile(name) {
        return path.basename(name, '.shp');
    }
}

function importFile(file) {
    var content;
    try {
        content = require(path.resolve(String(file)));
    } catch(_) { }
    return content;
}

function pickFunctionOption(value) {
    return (isFunction(value) && value) || (value && importFile(String(value))) || null;
}

function processFileContentByDefault(content, name) {
    return name + ' = ' + content + ';';
}

function prepareSettings(source, options) {
    options = Object.assign({}, options);
    if(options.settings) {
        options = Object.assign(importFile(options.settings) || {}, options);
    }
    return Object.assign(options, {
        input: source ? String(source) : null,
        output: options.output ? String(options.output) : null,
        precision: options.precision >= 0 ? Math.round(options.precision) : 4,
        processData: pickFunctionOption(options.processData) || eigen,
        processFileName: pickFunctionOption(options.processFileName) || eigen,
        processFileContent: pickFunctionOption(options.processFileContent) || processFileContentByDefault,
        info: options.isQuiet ? noop : console.info.bind(console),
        error: options.isQuiet ? noop : console.error.bind(console)
    });
}

function processFiles(source, options, callback) {
    var settings = prepareSettings(source, options && options.trim ? importFile(options) : options);
    settings.info('Started');
    collectFiles(settings.input, function(e, files) {
        e && settings.error(e.message);
        settings.info(files.map(function(file) {
            return '  ' + path.basename(file);
        }).join('\n'));
        when(files.map(function(file) {
            return function(done) {
                processFile(file, settings, done);
            };
        }), function() {
            settings.info('Finished');
            (isFunction(callback) ? callback : noop)();
        });
    });
}

exports.processFiles = processFiles;

var COMMAND_LINE_ARG_KEYS = [
    { key: '--output', name: 'output', arg: true, desc: 'Destination directory' },
    { key: '--process-data', name: 'processData', arg: true, desc: 'Process parsed data' },
    { key: '--process-file-name', name: 'processFileName', arg: true, desc: 'Process output file name' },
    { key: '--process-file-content', name: 'processFileContent', arg: true, desc: 'Process output file content' },
    { key: '--precision', name: 'precision', arg: true, desc: 'Precision of shape coordinates' },
    { key: '--json', name: 'isJSON', desc: 'Generate as a .json file' },
    { key: '--debug', name: 'isDebug', desc: 'Generate non minified file' },
    { key: '--quiet', name: 'isQuiet', desc: 'Suppress console output' },
    { key: '--settings', name: 'settings', arg: true, desc: 'Path to settings file' },
    { key: '--help', name: 'isHelp', desc: 'Print help' }
];

function parseCommandLineArgs() {
    var args = process.argv.slice(2);
    var options = { isEmpty: !args.length };
    var map = {};
    args.forEach(function(arg, i) {
        map[arg] = args[i + 1] || true;
    });
    COMMAND_LINE_ARG_KEYS.forEach(function(info) {
        var val = map[info.key];
        if(val) {
            options[info.name] = info.arg ? val : true;
        }
    });
    if(options.isHelp || options.isEmpty) {
        options = null;
        printCommandLineHelp();
    }
    return options;
}

function printCommandLineHelp() {
    var parts = ['node ', path.basename(process.argv[1]), ' Source '];
    var lines = [];
    var maxLength = Math.max.apply(null, COMMAND_LINE_ARG_KEYS.map(function(info) {
        return info.key.length;
    })) + 2;
    var message;
    COMMAND_LINE_ARG_KEYS.forEach(function(info) {
        var key = info.key;
        parts.push(key, ' ');
        if(info.arg) {
            parts.push('<', key.slice(2), '>', ' ');
        }
        lines.push(['  ', key, Array(maxLength - key.length).join(' '), info.desc].join(''));
    });
    message = ['Generates dxVectorMap-compatible files from shapefiles.', '\n', parts.join('')].concat(lines).join('\n');
    console.log(message);
}

function runFromConsole() {
    var args = parseCommandLineArgs();
    if(args) {
        processFiles(process.argv[2] || '', args);
    }
}

if(require.main === module) {
    runFromConsole();
}
