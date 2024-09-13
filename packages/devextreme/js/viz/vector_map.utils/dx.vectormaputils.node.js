/* !
 * DevExtreme (dx.vectormaputils.node.js)
 * Version: 24.2.0
 * Build date: Fri Sep 13 2024
 *
 * Copyright (c) 2012 - 2024 Developer Express Inc. ALL RIGHTS RESERVED
 * Read about DevExtreme licensing here: https://js.devexpress.com/Licensing/
 */


function noop() {}

function eigen(x) {
    return x;
}

function isFunction(target) {
    return 'function' === typeof target;
}

function wrapSource(source) {
    const buffer = wrapBuffer(source);
    let position = 0;
    var stream = {
        pos: function() {
            return position;
        },
        skip: function(count) {
            position += count;
            return stream;
        },
        ui8arr: function(length) {
            let i = 0;
            const list = [];
            list.length = length;
            for(; i < length; ++i) {
                list[i] = stream.ui8();
            }
            return list;
        },
        ui8: function() {
            const val = ui8(buffer, position);
            position += 1;
            return val;
        },
        ui16LE: function() {
            const val = ui16LE(buffer, position);
            position += 2;
            return val;
        },
        ui32LE: function() {
            const val = ui32LE(buffer, position);
            position += 4;
            return val;
        },
        ui32BE: function() {
            const val = ui32BE(buffer, position);
            position += 4;
            return val;
        },
        f64LE: function() {
            const val = f64LE(buffer, position);
            position += 8;
            return val;
        }
    };
    return stream;
}

function parseCore(source, roundCoordinates, errors) {
    const shapeData = source[0] ? parseShape(wrapSource(source[0]), errors) : {};
    const dataBaseFileData = source[1] ? parseDBF(wrapSource(source[1]), errors) : {};
    const features = buildFeatures(shapeData.shapes || [], dataBaseFileData.records || [], roundCoordinates);
    let result;
    if(features.length) {
        result = {
            type: 'FeatureCollection',
            features: features
        };
        result.bbox = shapeData.bBox;
    } else {
        result = null;
    }
    return result;
}

function buildFeatures(shapeData, dataBaseFileData, roundCoordinates) {
    const features = [];
    let i;
    const ii = features.length = Math.max(shapeData.length, dataBaseFileData.length);
    let shape;
    for(i = 0; i < ii; ++i) {
        shape = shapeData[i] || {};
        features[i] = {
            type: 'Feature',
            geometry: {
                type: shape.geoJSON_type || null,
                coordinates: shape.coordinates ? roundCoordinates(shape.coordinates) : []
            },
            properties: dataBaseFileData[i] || null
        };
    }
    return features;
}

function createCoordinatesRounder(precision) {
    const factor = Number('1E' + precision);

    function round(x) {
        return Math.round(x * factor) / factor;
    }
    return function process(values) {
        return values.map(values[0].length ? process : round);
    };
}

function buildParseArgs(source) {
    source = source || {};
    return ['shp', 'dbf'].map((function(key) {
        return function(done) {
            if(source.substr) {
                key = '.' + key;
                sendRequest(source + (source.substr(-key.length).toLowerCase() === key ? '' : key), (function(e, response) {
                    done(e, response);
                }));
            } else {
                done(null, source[key] || null);
            }
        };
    }));
}

function parse(source, parameters, callback) {
    let result;
    when(buildParseArgs(source), (function(errorArray, dataArray) {
        callback = isFunction(parameters) && parameters || isFunction(callback) && callback || noop;
        parameters = !isFunction(parameters) && parameters || {};
        const errors = [];
        errorArray.forEach((function(e) {
            e && errors.push(e);
        }));
        result = parseCore(dataArray, parameters.precision >= 0 ? createCoordinatesRounder(parameters.precision) : eigen, errors);
        callback(result, errors.length ? errors : null);
    }));
    return result;
}
exports.parse = parse;

function when(actions, callback) {
    const errorArray = [];
    const dataArray = [];
    let counter = 1;
    actions.forEach((function(action, i) {
        ++counter;
        action((function(e, data) {
            errorArray[i] = e;
            dataArray[i] = data;
            massDone();
        }));
    }));
    false;
    massDone();

    function massDone() {
        --counter;
        if(0 === counter && true) {
            callback(errorArray, dataArray);
        }
    }
}

function parseShape(stream, errors) {
    let timeStart;
    let timeEnd;
    let header;
    const records = [];
    let record;
    try {
        timeStart = new Date;
        header = parseShapeHeader(stream);
    } catch(e) {
        errors.push('shp: header parsing error: ' + e.message + ' / ' + e.description);
        return;
    }
    if(9994 !== header.fileCode) {
        errors.push('shp: file code: ' + header.fileCode + ' / expected: 9994');
    }
    if(1e3 !== header.version) {
        errors.push('shp: file version: ' + header.version + ' / expected: 1000');
    }
    try {
        while(stream.pos() < header.fileLength) {
            record = parseShapeRecord(stream, header.type, errors);
            if(record) {
                records.push(record);
            } else {
                break;
            }
        }
        if(stream.pos() !== header.fileLength) {
            errors.push('shp: file length: ' + header.fileLength + ' / actual: ' + stream.pos());
        }
        timeEnd = new Date;
    } catch(e) {
        errors.push('shp: records parsing error: ' + e.message + ' / ' + e.description);
    }
    return {
        bBox: header.bBox_XY,
        type: header.shapeType,
        shapes: records,
        errors: errors,
        time: timeEnd - timeStart
    };
}

function readPointShape(stream, record) {
    record.coordinates = readPointArray(stream, 1)[0];
}

function readPolyLineShape(stream, record) {
    const bBox = readBBox(stream);
    const numParts = readInteger(stream);
    const numPoints = readInteger(stream);
    const parts = readIntegerArray(stream, numParts);
    const points = readPointArray(stream, numPoints);
    const rings = [];
    let i;
    rings.length = numParts;
    for(i = 0; i < numParts; ++i) {
        rings[i] = points.slice(parts[i], parts[i + 1] || numPoints);
    }
    record.bBox = bBox;
    record.coordinates = rings;
}

function readMultiPointShape(stream, record) {
    record.bBox = readBBox(stream);
    record.coordinates = readPointArray(stream, readInteger(stream));
}

function readPointMShape(stream, record) {
    record.coordinates = readPointArray(stream, 1)[0];
    record.coordinates.push(readDoubleArray(stream, 1)[0]);
}

function readMultiPointMShape(stream, record) {
    const bBox = readBBox(stream);
    const numPoints = readInteger(stream);
    const points = readPointArray(stream, numPoints);
    const mBox = readPair(stream);
    const mValues = readDoubleArray(stream, numPoints);
    record.bBox = bBox;
    record.mBox = mBox;
    record.coordinates = merge_XYM(points, mValues, numPoints);
}

function readPolyLineMShape(stream, record) {
    const bBox = readBBox(stream);
    const numParts = readInteger(stream);
    const numPoints = readInteger(stream);
    const parts = readIntegerArray(stream, numParts);
    const points = readPointArray(stream, numPoints);
    const mBox = readPair(stream);
    const mValues = readDoubleArray(stream, numPoints);
    const rings = [];
    let i;
    let from;
    let to;
    rings.length = numParts;
    for(i = 0; i < numParts; ++i) {
        from = parts[i];
        to = parts[i + 1] || numPoints;
        rings[i] = merge_XYM(points.slice(from, to), mValues.slice(from, to), to - from);
    }
    record.bBox = bBox;
    record.mBox = mBox;
    record.coordinates = rings;
}

function readPointZShape(stream, record) {
    record.coordinates = readPointArray(stream, 1)[0];
    record.push(readDoubleArray(stream, 1)[0], readDoubleArray(stream, 1)[0]);
}

function readMultiPointZShape(stream, record) {
    const bBox = readBBox(stream);
    const numPoints = readInteger(stream);
    const points = readPointArray(stream, numPoints);
    const zBox = readPair(stream);
    const zValues = readDoubleArray(stream, numPoints);
    const mBox = readPair(stream);
    const mValue = readDoubleArray(stream, numPoints);
    record.bBox = bBox;
    record.zBox = zBox;
    record.mBox = mBox;
    record.coordinates = merge_XYZM(points, zValues, mValue, numPoints);
}

function readPolyLineZShape(stream, record) {
    const bBox = readBBox(stream);
    const numParts = readInteger(stream);
    const numPoints = readInteger(stream);
    const parts = readIntegerArray(stream, numParts);
    const points = readPointArray(stream, numPoints);
    const zBox = readPair(stream);
    const zValues = readDoubleArray(stream, numPoints);
    const mBox = readPair(stream);
    const mValues = readDoubleArray(stream, numPoints);
    const rings = [];
    let i;
    let from;
    let to;
    rings.length = numParts;
    for(i = 0; i < numParts; ++i) {
        from = parts[i];
        to = parts[i + 1] || numPoints;
        rings[i] = merge_XYZM(points.slice(from, to), zValues.slice(from, to), mValues.slice(from, to), to - from);
    }
    record.bBox = bBox;
    record.zBox = zBox;
    record.mBox = mBox;
    record.coordinates = rings;
}

function readMultiPatchShape(stream, record) {
    const bBox = readBBox(stream);
    const numParts = readInteger(stream);
    const numPoints = readInteger(stream);
    const parts = readIntegerArray(stream, numParts);
    const partTypes = readIntegerArray(stream, numParts);
    const points = readPointArray(stream, numPoints);
    const zBox = readPair(stream);
    const zValues = readDoubleArray(stream, numPoints);
    const mBox = readPair(stream);
    const rings = [];
    let i;
    let from;
    let to;
    rings.length = numParts;
    for(i = 0; i < numParts; ++i) {
        from = parts[i];
        to = parts[i + 1] || numPoints;
        rings[i] = merge_XYZM(points.slice(from, to), zValues.slice(from, to), mValues.slice(from, to), to - from);
    }
    record.bBox = bBox;
    record.zBox = zBox;
    record.mBox = mBox;
    record.types = partTypes;
    record.coordinates = rings;
}
const SHP_TYPES = {
    0: 'Null',
    1: 'Point',
    3: 'PolyLine',
    5: 'Polygon',
    8: 'MultiPoint',
    11: 'PointZ',
    13: 'PolyLineZ',
    15: 'PolygonZ',
    18: 'MultiPointZ',
    21: 'PointM',
    23: 'PolyLineM',
    25: 'PolygonM',
    28: 'MultiPointM',
    31: 'MultiPatch'
};
const SHP_RECORD_PARSERS = {
    0: noop,
    1: readPointShape,
    3: readPolyLineShape,
    5: readPolyLineShape,
    8: readMultiPointShape,
    11: readPointZShape,
    13: readPolyLineZShape,
    15: readPolyLineZShape,
    18: readMultiPointZShape,
    21: readPointMShape,
    23: readPolyLineMShape,
    25: readPolyLineMShape,
    28: readMultiPointMShape,
    31: readMultiPatchShape
};
const SHP_TYPE_TO_GEOJSON_TYPE_MAP = {
    Null: 'Null',
    Point: 'Point',
    PolyLine: 'MultiLineString',
    Polygon: 'Polygon',
    MultiPoint: 'MultiPoint',
    PointZ: 'Point',
    PolyLineZ: 'MultiLineString',
    PolygonZ: 'Polygon',
    MultiPointZ: 'MultiPoint',
    PointM: 'Point',
    PolyLineM: 'MultiLineString',
    PolygonM: 'Polygon',
    MultiPointM: 'MultiPoint',
    MultiPatch: 'MultiPatch'
};

function parseShapeHeader(stream) {
    const header = {};
    header.fileCode = stream.ui32BE();
    stream.skip(20);
    header.fileLength = stream.ui32BE() << 1;
    header.version = stream.ui32LE();
    header.type_number = stream.ui32LE();
    header.type = SHP_TYPES[header.type_number];
    header.bBox_XY = readBBox(stream);
    header.bBox_ZM = readPointArray(stream, 2);
    return header;
}

function readInteger(stream) {
    return stream.ui32LE();
}

function readIntegerArray(stream, length) {
    const array = [];
    let i;
    array.length = length;
    for(i = 0; i < length; ++i) {
        array[i] = readInteger(stream);
    }
    return array;
}

function readDoubleArray(stream, length) {
    const array = [];
    let i;
    array.length = length;
    for(i = 0; i < length; ++i) {
        array[i] = stream.f64LE();
    }
    return array;
}

function readBBox(stream) {
    return readDoubleArray(stream, 4);
}

function readPair(stream) {
    return [stream.f64LE(), stream.f64LE()];
}

function readPointArray(stream, count) {
    const points = [];
    let i;
    points.length = count;
    for(i = 0; i < count; ++i) {
        points[i] = readPair(stream);
    }
    return points;
}

function merge_XYM(xy, m, length) {
    const array = [];
    let i;
    array.length = length;
    for(i = 0; i < length; ++i) {
        array[i] = [xy[i][0], xy[i][1], m[i]];
    }
    return array;
}

function merge_XYZM(xy, z, m, length) {
    const array = [];
    let i;
    array.length = length;
    for(i = 0; i < length; ++i) {
        array[i] = [xy[i][0], xy[i][1], z[i], m[i]];
    }
    return array;
}

function parseShapeRecord(stream, generalType, errors) {
    let record = {
        number: stream.ui32BE()
    };
    const length = stream.ui32BE() << 1;
    let pos = stream.pos();
    const type = stream.ui32LE();
    record.type_number = type;
    record.type = SHP_TYPES[type];
    record.geoJSON_type = SHP_TYPE_TO_GEOJSON_TYPE_MAP[record.type];
    if(record.type) {
        if(record.type !== generalType) {
            errors.push('shp: shape #' + record.number + ' type: ' + record.type + ' / expected: ' + generalType);
        }
        SHP_RECORD_PARSERS[type](stream, record);
        pos = stream.pos() - pos;
        if(pos !== length) {
            errors.push('shp: shape #' + record.number + ' length: ' + length + ' / actual: ' + pos);
        }
    } else {
        errors.push('shp: shape #' + record.number + ' type: ' + type + ' / unknown');
        record = null;
    }
    return record;
}

function parseDBF(stream, errors) {
    let timeStart;
    let timeEnd;
    let header;
    let parseData;
    let records;
    try {
        timeStart = new Date;
        header = parseDataBaseFileHeader(stream, errors);
        parseData = prepareDataBaseFileRecordParseData(header, errors);
        records = parseDataBaseFileRecords(stream, header.numberOfRecords, header.recordLength, parseData, errors);
        timeEnd = new Date;
    } catch(e) {
        errors.push('dbf: parsing error: ' + e.message + ' / ' + e.description);
    }
    return {
        records: records,
        errors: errors,
        time: timeEnd - timeStart
    };
}

function parseDataBaseFileHeader(stream, errors) {
    let i;
    const header = {
        versionNumber: stream.ui8(),
        lastUpdate: new Date(1900 + stream.ui8(), stream.ui8() - 1, stream.ui8()),
        numberOfRecords: stream.ui32LE(),
        headerLength: stream.ui16LE(),
        recordLength: stream.ui16LE(),
        fields: []
    };
    let term;
    stream.skip(20);
    for(i = (header.headerLength - stream.pos() - 1) / 32; i > 0; --i) {
        header.fields.push(parseFieldDescriptor(stream));
    }
    term = stream.ui8();
    if(13 !== term) {
        errors.push('dbf: header terminator: ' + term + ' / expected: 13');
    }
    return header;
}
const _fromCharCode = String.fromCharCode;

function getAsciiString(stream, length) {
    return _fromCharCode.apply(null, stream.ui8arr(length));
}

function parseFieldDescriptor(stream) {
    const desc = {
        name: getAsciiString(stream, 11).replace(/\0*$/gi, ''),
        type: _fromCharCode(stream.ui8()),
        length: stream.skip(4).ui8(),
        count: stream.ui8()
    };
    stream.skip(14);
    return desc;
}
const DBF_FIELD_PARSERS = {
    C: function(stream, length) {
        let str = getAsciiString(stream, length);
        try {
            str = decodeURIComponent(escape(str));
        } catch(e) {}
        return str.trim();
    },
    N: function(stream, length) {
        const str = getAsciiString(stream, length);
        return parseFloat(str);
    },
    D: function(stream, length) {
        const str = getAsciiString(stream, length);
        return new Date(str.substring(0, 4), str.substring(4, 6) - 1, str.substring(6, 8));
    }
};

function DBF_FIELD_PARSER_DEFAULT(stream, length) {
    stream.skip(length);
    return null;
}

function prepareDataBaseFileRecordParseData(header, errors) {
    const list = [];
    let i = 0;
    const ii = header.fields.length;
    let item;
    let field;
    let totalLength = 0;
    for(i = 0; i < ii; ++i) {
        field = header.fields[i];
        item = {
            name: field.name,
            parser: DBF_FIELD_PARSERS[field.type],
            length: field.length
        };
        if(!item.parser) {
            item.parser = DBF_FIELD_PARSER_DEFAULT;
            errors.push('dbf: field ' + field.name + ' type: ' + field.type + ' / unknown');
        }
        totalLength += field.length;
        list.push(item);
    }
    if(totalLength + 1 !== header.recordLength) {
        errors.push('dbf: record length: ' + header.recordLength + ' / actual: ' + (totalLength + 1));
    }
    return list;
}

function parseDataBaseFileRecords(stream, recordCount, recordLength, parseData, errors) {
    let i;
    let j;
    const jj = parseData.length;
    let pos;
    const records = [];
    let record;
    let pd;
    for(i = 0; i < recordCount; ++i) {
        record = {};
        pos = stream.pos();
        stream.skip(1);
        for(j = 0; j < jj; ++j) {
            pd = parseData[j];
            record[pd.name] = pd.parser(stream, pd.length);
        }
        pos = stream.pos() - pos;
        if(pos !== recordLength) {
            errors.push('dbf: record #' + (i + 1) + ' length: ' + recordLength + ' / actual: ' + pos);
        }
        records.push(record);
    }
    return records;
}

function wrapBuffer(buffer) {
    return buffer;
}

function ui8(stream, position) {
    return stream[position];
}

function ui16LE(stream, position) {
    return stream.readUInt16LE(position);
}

function ui32LE(stream, position) {
    return stream.readUInt32LE(position);
}

function ui32BE(stream, position) {
    return stream.readUInt32BE(position);
}

function f64LE(stream, position) {
    return stream.readDoubleLE(position);
}
const fs = require('fs');

function sendRequest(path, callback) {
    fs.readFile(path, callback);
}
const path = require('path');

function normalizeJsName(value) {
    return value.trim().replace('-', '_').replace(' ', '_');
}

function isHighSurrogate(codePoint) {
    return codePoint >= 55296 && codePoint <= 56319;
}

function isLowSurrogate(codePoint) {
    return codePoint >= 56320 && codePoint <= 57343;
}

function truncate(getLength, string, byteLength) {
    if('string' !== typeof string) {
        throw new Error('Input must be string');
    }
    const charLength = string.length;
    let curByteLength = 0;
    let codePoint;
    let segment;
    for(let i = 0; i < charLength; i += 1) {
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
const illegalRe = /[\/\?<>\\:\*\|"]/g;
const controlRe = /[\x00-\x1f\x80-\x9f]/g;
const reservedRe = /^\.+$/;
const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const windowsTrailingRe = /[\. ]+$/;

function sanitize(input, replacement) {
    if('string' !== typeof input) {
        throw new Error('Input must be string');
    }
    const sanitized = input.replace(illegalRe, replacement).replace(controlRe, replacement).replace(reservedRe, replacement).replace(windowsReservedRe, replacement).replace(windowsTrailingRe, replacement);
    return truncate(sanitized, 255);
}

function processFile(file, options, callback) {
    const sanitizedFile = sanitize(file);
    const name = path.basename(sanitizedFile, path.extname(sanitizedFile));
    options.info('%s: started', name);
    parse(sanitizedFile, {
        precision: options.precision
    }, (function(shapeData, errors) {
        let content;
        options.info('%s: finished', name);
        if(errors) {
            errors.forEach((function(e) {
                options.error('  ' + e);
            }));
        }
        if(shapeData) {
            content = JSON.stringify(options.processData(shapeData), null, options.isDebug ? 4 : void 0);
            if(!options.isJSON) {
                content = options.processFileContent(content, normalizeJsName(name));
            }
            const outputDir = path.resolve(options.output || path.dirname(sanitizedFile));
            const safePath = path.resolve(outputDir, options.processFileName(name + (options.isJSON ? '.json' : '.js')));
            const relativePath = path.relative(outputDir, safePath);
            if(relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                options.error('Attempt to write outside the allowed directory');
                return callback();
            }
            fs.writeFile(safePath, content, (function(e) {
                if(e) {
                    options.error('  ' + e.message);
                }
                callback();
            }));
        } else {
            callback();
        }
    }));
}

function collectFiles(dir, done) {
    const input = path.resolve(dir || '');
    fs.stat(input, (function(e, stat) {
        if(e) {
            done(e, []);
        } else if(stat.isFile()) {
            done(null, checkFile(input) ? [path.resolve(path.dirname(input), normalizeFile(input))] : []);
        } else if(stat.isDirectory()) {
            fs.readdir(input, (function(e, dirItems) {
                const list = [];
                dirItems.forEach((function(dirItem) {
                    if(checkFile(dirItem)) {
                        list.push(path.resolve(input, normalizeFile(dirItem)));
                    }
                }));
                done(null, list);
            }));
        } else {
            done(null, []);
        }
    }));

    function checkFile(name) {
        return '.shp' === path.extname(name).toLowerCase();
    }

    function normalizeFile(name) {
        return path.basename(name, '.shp');
    }
}

function importFile(file) {
    let content;
    try {
        content = require(path.resolve(String(file)));
    } catch(_) {}
    return content;
}

function pickFunctionOption(value) {
    return isFunction(value) && value || value && importFile(String(value)) || null;
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
    const settings = prepareSettings(source, options && options.trim ? importFile(options) : options);
    settings.info('Started');
    collectFiles(settings.input, (function(e, files) {
        e && settings.error(e.message);
        settings.info(files.map((function(file) {
            return '  ' + path.basename(file);
        })).join('\n'));
        when(files.map((function(file) {
            return function(done) {
                processFile(file, settings, done);
            };
        })), (function() {
            settings.info('Finished');
            (isFunction(callback) ? callback : noop)();
        }));
    }));
}
exports.processFiles = processFiles;
const COMMAND_LINE_ARG_KEYS = [{
    key: '--output',
    name: 'output',
    arg: true,
    desc: 'Destination directory'
}, {
    key: '--process-data',
    name: 'processData',
    arg: true,
    desc: 'Process parsed data'
}, {
    key: '--process-file-name',
    name: 'processFileName',
    arg: true,
    desc: 'Process output file name'
}, {
    key: '--process-file-content',
    name: 'processFileContent',
    arg: true,
    desc: 'Process output file content'
}, {
    key: '--precision',
    name: 'precision',
    arg: true,
    desc: 'Precision of shape coordinates'
}, {
    key: '--json',
    name: 'isJSON',
    desc: 'Generate as a .json file'
}, {
    key: '--debug',
    name: 'isDebug',
    desc: 'Generate non minified file'
}, {
    key: '--quiet',
    name: 'isQuiet',
    desc: 'Suppress console output'
}, {
    key: '--settings',
    name: 'settings',
    arg: true,
    desc: 'Path to settings file'
}, {
    key: '--help',
    name: 'isHelp',
    desc: 'Print help'
}];

function parseCommandLineArgs() {
    const args = process.argv.slice(2);
    let options = {
        isEmpty: !args.length
    };
    const map = {};
    args.forEach((function(arg, i) {
        map[arg] = args[i + 1] || true;
    }));
    COMMAND_LINE_ARG_KEYS.forEach((function(info) {
        const val = map[info.key];
        if(val) {
            options[info.name] = info.arg ? val : true;
        }
    }));
    if(options.isHelp || options.isEmpty) {
        options = null;
        printCommandLineHelp();
    }
    return options;
}

function printCommandLineHelp() {
    const parts = ['node ', path.basename(process.argv[1]), ' Source '];
    const lines = [];
    const maxLength = Math.max.apply(null, COMMAND_LINE_ARG_KEYS.map((function(info) {
        return info.key.length;
    }))) + 2;
    let message;
    COMMAND_LINE_ARG_KEYS.forEach((function(info) {
        const key = info.key;
        parts.push(key, ' ');
        if(info.arg) {
            parts.push('<', key.slice(2), '>', ' ');
        }
        lines.push(['  ', key, Array(maxLength - key.length).join(' '), info.desc].join(''));
    }));
    message = ['Generates dxVectorMap-compatible files from shapefiles.', '\n', parts.join('')].concat(lines).join('\n');
    console.log(message);
}

function runFromConsole() {
    const args = parseCommandLineArgs();
    if(args) {
        processFiles(process.argv[2] || '', args);
    }
}
if(require.main === module) {
    runFromConsole();
}
