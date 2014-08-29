var GLOBAL_CORS_PROXY = "http://cors-anywhere.herokuapp.com/";

var deckNotes;
var deckFields;
var deckName;
var ankiSeparator = '\x1f';

// Huge props to http://stackoverflow.com/a/9507713/500207
function tabulate(datatable, columns, containerString) {
    var table = d3.select(containerString).append("table"),
        thead = table.append("thead"), tbody = table.append("tbody");

    // append the header row
    thead.append("tr")
        .selectAll("th")
        .data(columns)
        .enter()
        .append("th")
        .text(function(column) { return column; })
        .attr("class", function(d) { return 'field-' + d.replace(" ", "-"); });

    // create a row for each object in the data
    var rows = tbody.selectAll("tr").data(datatable).enter().append("tr");

    // create a cell in each row for each column
    var cells = rows.selectAll("td")
                    .data(
                         function(row) {
                             return columns.map(function(column) {
                                 return {column : column, value : row[column]};
                             });
                         })
                    .enter()
                    .append("td")
                    .html(function(d) { return d.value; })
                    .attr("class", function(d) {
                        return 'field-' + d.column.replace(" ", "-");
                    });

    return table;
}

function sqlToTable(uInt8ArraySQLdb) {
    var db = new SQL.Database(uInt8ArraySQLdb);

    col = db.exec("SELECT models FROM col");
    var modelsFunction = Function('return ' + col[0].values[0][0]);
    var models = modelsFunction();

    var fnames = [];
    for (key in models) {
        if (models.hasOwnProperty(key)) {
            // This happens once every model: FIXME
            deckName = models[key].name;
            models[key].flds.forEach(
                function(val, idx, arr) { fnames.push(val.name); });
        }
    }
    deckFields = fnames;

    // Notes table
    deckNotes = db.exec("SELECT flds FROM notes");

    // Actual notes
    var notes = [];
    var arrayToObj = function(facts) {
        var myObj = {};
        for (var i = 0; i < facts.length; i++) {
            myObj[deckFields[i]] = facts[i];
        }
        return myObj;
    };
    deckNotes[0].values.forEach(
        function(val) { notes.push(arrayToObj(val[0].split(ankiSeparator))); });
    deckNotes = notes;

    // Visualize!
    if (0 == specialDisplayHandlers()) {
        d3.select("#anki").append("h2").text(deckName);
        tabulate(deckNotes, deckFields, "#anki");
    }
}

function ankiBinaryToTable(ankiArray, options) {
    var compressed = new Uint8Array(ankiArray);
    var unzip = new Zlib.Unzip(compressed);
    var filenames = unzip.getFilenames();
    if (filenames.indexOf("collection.anki2") >= 0) {
        var plain = unzip.decompress("collection.anki2");
        sqlToTable(plain);
    }
}

function ankiURLToTable(ankiURL, useCorsProxy, corsProxyURL) {
    if (typeof useCorsProxy === 'undefined') {
        useCorsProxy = false;
    }
    if (typeof corsProxyURL === 'undefined') {
        corsProxyURL = GLOBAL_CORS_PROXY;
    }

    var zipxhr = new XMLHttpRequest();
    zipxhr.open('GET', (useCorsProxy ? corsProxyURL : "") + ankiURL, true);
    zipxhr.responseType = 'arraybuffer';
    zipxhr.onload = function(e) { ankiBinaryToTable(this.response); };
    zipxhr.send();
}

function arrayNamesToObj(fields, values) {
    var obj = {};
    for (i in values) {
        obj[fields[i]] = values[i];
    }
    return obj;
}

var revlogTable;
function ankiSQLToRevlogTable(array, options) {
    if (typeof options === 'undefined') {
        options = {limit : 100, recent : true};
    }

    var sqliteBinary = new Uint8Array(array);
    var sqlite = new SQL.Database(sqliteBinary);

    // The deck name is in decks, and the field names are in models
    // which are JSON, and have to be handled outside SQL.
    var decksTable = sqlite.exec('SELECT models,decks FROM col')[0].values[0];
    var models = $.parseJSON(decksTable[0]);
    var decks = $.parseJSON(decksTable[1]);

    // The reviews
    var query =
        'SELECT revlog.id, revlog.ease, revlog.time, notes.flds, notes.sfld, cards.reps, cards.lapses, cards.did, notes.mid \
FROM revlog \
LEFT OUTER JOIN cards ON revlog.cid=cards.id \
LEFT OUTER JOIN notes ON cards.nid=notes.id \
ORDER BY revlog.id' +
        (options.recent ? " DESC " : "") +
        (options.limit && options.limit > 0 ? " LIMIT " + options.limit : "");
    var queryResultNames =
        "revId,ease,timeToAnswer,noteFacts,noteSortKeyFact,reps,lapses,deckId,\
modelId".split(',');

    // Run the query and convert the resulting array of arrays into an array of
    // objects
    revlogTable = sqlite.exec(query)[0].values;
    revlogTable = revlogTable.map(
        function(arr) { return arrayNamesToObj(queryResultNames, arr); });

    revlogTable.forEach(function(rev) {
        // Add deck name
        rev.deckName = rev.deckId ? decks[rev.deckId].name : "unknown deck";
        // delete rev.deckId;

        // Convert facts string to a fact object
        var fieldNames =
            rev.modelId
                ? models[rev.modelId].flds.map(function(f) { return f.name; })
                : null;
        rev.noteFacts =
            rev.noteFacts ? arrayNamesToObj(fieldNames,
                                            rev.noteFacts.split(ankiSeparator))
                          : "unknown note facts";
        // Add model name
        rev.modelName =
            rev.modelId ? models[rev.modelId].name : "unknown model";
        // delete rev.modelId;

        // Add review date
        rev.date = new Date(rev.revId);
        rev.dateString = rev.date.toString();

        // Add a JSON representation of facts
        rev.noteFactsJSON = typeof rev.noteFacts == "object"
                                ? JSON.stringify(rev.noteFacts)
                                : "unknown note facts";

        // Switch timeToAnswer from milliseconds to seconds
        rev.timeToAnswer /= 1000;
    });

    // Create div for results
    displayRevlogOutputOptions();
}

function displayRevlogOutputOptions() {
    var ul = d3.select("body")
                 .append("div")
                 .attr("id", "reviews")
                 .append("div")
                 .attr("id", "reviews-options")
                 .append("ul");
    var tooMuch = 101;
    if (revlogTable.length > tooMuch) {
        ul.append('li')
            .attr("id", "tabulate-request")
            .append("button")
            .text("Tabulate " + revlogTable.length + " review" +
                  (revlogTable.length > 1 ? "s" : ""))
            .on("click", function() { tabulateReviews(); });

        ul.append('li')
            .attr("id", "export-request")
            .append("button")
            .text("Generate CSV spreadsheet")
            .on("click", function() { generateReviewsCSV(); });
    } else {
        tabulateReviews();
        generateReviewsCSV();
    }
}

function generateReviewsCSV() {  // Export
    var csv = convert(
        revlogTable,
        "dateString,ease,timeToAnswer,noteSortKeyFact,deckName,modelName,lapses,\
reps,noteFactsJSON".split(','));
    var blob = new Blob([csv], {type : 'data:text/csv;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    d3.select("div#reviews-options ul")
        .append("li").attr("id", "export-completed")
        .append("a")
        .attr("href", url)
        .classed('csv-download', true)
        .text("Download CSV!");
}

function tabulateReviews() {
    tabulate(revlogTable,
             "date,ease,timeToAnswer,noteSortKeyFact,deckName,modelName,lapses,\
reps,noteFactsJSON".split(','),
             "div#reviews");
}

// Lifted from
// https://github.com/matteofigus/nice-json2csv/blob/master/lib/nice-json2csv.js
// (MIT License)
function fixInput(parameter) {
    if (parameter && parameter.length == undefined &&
        _.keys(parameter).length > 0)
        parameter = [parameter];  // data is a json object instead of an array
                                  // of json objects

    return parameter;
}
function getColumns(data) {
    var columns = [];

    for (var i = 0; i < data.length; i++)
        columns = _.union(columns, _.keys(data[i]));

    return columns;
}
function convertToCsv(data) {
    return JSON.stringify(data)
        .replace(/],\[/g, '\n')
        .replace(/]]/g, '')
        .replace(/\[\[/g, '')
        .replace(/\\"/g, '""');
}
function convert(data, headers, suppressHeader) {
    if (!_.isBoolean(suppressHeader)) suppressHeader = false;

    data = fixInput(data);

    if (data == null || data.length == 0) {
        return "";
    }

    var columns = headers ? ((typeof headers == 'string') ? [headers] : headers)
                          : getColumns(data);

    var rows = [];

    if (!suppressHeader) {
        rows.push(columns);
    }

    for (var i = 0; i < data.length; i++) {
        var row = [];
        _.forEach(columns, function(column) {
            var value =
                typeof data[i][column] == "object" && data[i][column] &&
                    "[Object]" ||
                typeof data[i][column] == "number" && String(data[i][column]) ||
                data[i][column] || "";
            row.push(value);
        });
        rows.push(row);
    }

    return convertToCsv(rows);
}

$(document).ready(function() {
    var eventHandleToTable = function(event) {
        event.stopPropagation();
        event.preventDefault();
        var f = event.target.files[0];
        if (!f) {
            f = event.dataTransfer.files[0];
        }
        // console.log(f.name);

        var reader = new FileReader();
        if ("function" in event.data) {
            reader.onload =
                function(e) { event.data.function(e.target.result); };
        } else {
            reader.onload = function(e) { ankiBinaryToTable(e.target.result); };
        }
        /* // If the callback doesn't need the File object, just use the above.
        reader.onload = (function(theFile) {
            return function(e) {
                console.log(theFile.name);
                ankiBinaryToTable(e.target.result);
            };
        })(f);
        */
        reader.readAsArrayBuffer(f);
    };

    // Deck browser
    $("#ankiFile").change({"function" : ankiBinaryToTable}, eventHandleToTable);
    $("#ankiURLSubmit").click(function(event) {
        ankiURLToTable($("#ankiURL").val(), true);
        $("#ankiURL").val('');
    });

    // Review browser
    $("#sqliteFile")
        .change({
                  "function" :
                      function(data) {
                          ankiSQLToRevlogTable(data, {
                              limit : parseInt($('input#sqliteLimit').val()),
                              recent : $('input#sqliteRecent').is(':checked')
                          });
                      },
                },
                eventHandleToTable);

    // Only for local development
    // ankiURLToTable('/n.apkg');
});

/**
* Hook that modifies Nayr's Japanese Core5000 Anki deck
* (see https://ankiweb.net/shared/info/631662071)
*
* @param {Array} deckNotes - array of Anki Notes from the above deck
* @param {String[]} deckFields - names of the fields of the Notes
* @return {Array} an updated version of deckNotes
*
* Each Note object containing properties Expression, Meaning, Reading, English
* Translation, Word, Frequency Order, and Sound.
*
* Kana in the "Reading" field will be changed from "[kana]" to being wrapped in
*<span> tags. And each of the items in the "Word" field, which contains the
*Japanese word, its reading in roumaji (Latin characters), one or more
*parts-of-speech, and English translations, will be encased in <span> tags
*(ideally these would be their own independent fields, but some rows have more
*than one part-of-speech).
*/
function core5000Modify(deckNotes, deckFields) {
    d3.select("body").append("div").attr("id", "core5000");
    d3.select("#core5000").append("h2").text(deckName);

    //------------------------------------------------------------
    // Variables and functions to help deal with the "Word" column
    //------------------------------------------------------------
    // Parts of speech abbreviations
    var abbreviations =
        "adn.,adv.,aux.,conj.,cp.,i-adj.,interj.,n.,na-adj.,num.,p.,p. \
case,p. conj.,p. disc.,pron.,v.".split(',');
    var abbreviationsOr = abbreviations.join("|").replace(/\./g, '\\.');

    // The basic structure of the "Word" column is:
    //
    // 1. some kanji or kana, plus other random things like commas, parentheses,
    // both ascii and full-width.
    // 2. Some roumaji
    // 3. One or more parts of speech, using the above abbreviations
    // 4. English translations.
    //
    // The following three strings will be the regexps that match #1--#3.
    // They've been carefully chosen to work with wrinkles in the database,
    // e.g., more than one of the above four-step sequences in a single row,
    // multiple adjacent parts-of-speech, or multiple
    // part-of-speech-and-translation pairs. All these strings intended to
    // become regexps will go through XRegExp, which expands out the
    // Han/Katakana/Hiragana groups.
    var kanaKanjiWordRegexp = '([^a-z]+)';
    var romajiRegexp = '([a-z\\s,\\-()’]+)';
    var partOfSpeechRegexp = '((?: |,|' + abbreviationsOr + ')+)';

    // Break up a string containing one {kanji/kana + roumaji + part-of-speech +
    // translations} sequence. The critical idea in this function is to split
    // the input string between part-of-speech-abbreviations, and do some
    // processing on that to handle two edge cases:
    //
    // 1. "いろいろ iroiro adv., na-adj. various" <-- more than one adjacent
    //     part-of-speech abbreviation separated by a comma
    // 2. "余り amari adv. the rest n. (not) much" <-- more than one
    //     part-of-speech/translation pairs.
    //
    // It handles both these cases by splitting the string into an array along
    // (and including) part-of-speech-abbreviation boundaries. To handle edge
    // case 1 above, it finds elements of the resulting array that are
    // between part-of-speech abbreviations but which are
    // whitespace/punctuation, and merges those elements into a single
    // "part-of-speech" element.
    //
    // Then it builds an array of parts-of-speech and a matching array of
    // translations. This handles case 2 above. These two arrays, as well as the
    // kanji/kana and roumaji, are returned as an object.
    function bar(seqString) {
        var arr = seqString.split(XRegExp('(' + abbreviationsOr + ')'));

        var isAbbreviation = arr.map(
            function(x) { return abbreviations.indexOf(x) >= 0 ? 1 : 0; });
        var isWhitePunctuation =
            arr.map(function(x) { return x.match(/^[\s,]*$/) ? 1 : 0; });
        var isAbbrOrWhitePunct = isAbbreviation.map(
            function(x, i) { return x + isWhitePunctuation[i]; });

        // combineJunk will find [..., "adv.", ",", "na-adj.", ...] and splice
        // it into [..., "adv., na-adj.", ...].
        var tmp = combineJunk(isAbbrOrWhitePunct, arr);
        arr = tmp.data_array;
        isAbbrOrWhitePunct = tmp.indicator_array;
        // Updated arr and isAbbrOrWhitePunct. We need the latter to build the
        // return object.

        // Part-of-speech array and translation array, which will go itno the
        // return object. We rely on each part-of-speech element in arr to be
        // followed by a translation. So far, this happens.
        var pos = [];
        var translation = [];
        arr.map(function(x, i) {
            if (isAbbrOrWhitePunct[i]) {
                pos.push(x);
                translation.push(arr[i + 1]);
            }
        });

        // Grab the initial kanji/kana as well as the roumaji. String.match()
        // will return a three-element array here: the total match, and the two
        // groups corresponding to the two regexps.
        var kanaKanjiMatch =
            seqString.match(XRegExp(kanaKanjiWordRegexp + ' ' + romajiRegexp +
                                    ' ' + partOfSpeechRegexp));
        return {
            pos : pos,
            translation : translation,
            word : kanaKanjiMatch[1],
            romaji : kanaKanjiMatch[2]
        };
    };

    function combineJunk(indicator_array, data_array) {
        var i = 1;
        while (i < indicator_array.length) {
            if (indicator_array[i] == indicator_array[i - 1] &&
                indicator_array[i] > 0) {
                indicator_array.splice(i - 1, 2, 1);
                data_array.splice(i - 1, 2, data_array[i - 1] + data_array[i]);
            } else {
                i++;
            }
        }
        return {data_array : data_array, indicator_array : indicator_array};
    }

    // Get rid of &nbsp; and such. It'll mess up my regexping.
    function decodeHtml(html) {
        var txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    }

    var wordColumnReplace = function(s) {
        if (s.search("&") >= 0) {
            s = decodeHtml(s);
        }

        var arr = s.split("<div>");

        return arr.map(function(s) {
            var decomp = bar(s);
            var posTrans = decomp.pos.map(function(pos, i) {
                return '<span class="part-of-speech">' + pos +
                       '</span> <span class="target-words-meaning">' +
                       decomp.translation[i] + '</span>';
            }).join(" ");
            return '<span class="target-words">' + decomp.word +
                   '</span> <span class="target-words-romaji">' +
                   decomp.romaji + "</span> " + posTrans;
        }).join("<div>");
    };

    //--------------------------------------------
    // Variable for Reading column cleanup of kana
    //--------------------------------------------
    var kanaRegexp = XRegExp('\\[([\\p{Hiragana}\\p{Katakana}]+)\\]', 'g');

    //-----------------
    // Complete cleanup
    //-----------------
    deckNotes.map(function(note, loc, arr) {
        // Break up Word column into its four separate components
        note.Word = wordColumnReplace(note.Word);

        // Replace [kana] with spans
        note.Reading = note.Reading.replace(kanaRegexp,
                                            function(match, kana, offset, str) {
            return '<span class="reading kana">' + kana + '</span>';
        });

        return note;
    });

    //-------------------------
    // Visualization and return
    //-------------------------
    tabulate(deckNotes, deckFields, "#core5000");

    // Instead of setting the styles of thousands of <td> tags individually,
    // just slash on a CSS tag to the DOM.
    d3.select("head").insert("style", ":first-child").text(
        "#core5000 th.field-Meaning, #core5000 th.field-Sound {font-size: 10%}\
#core5000 th.field-Frequency-Order {font-size:50%}\
#core5000 td.field-Expression, #core5000 td.field-Reading {font-size: 150%}\
#core5000 td.field-English-Translation, #core5000  td.field-Word {font-size: 75%}");

    return deckNotes;
}

function specialDisplayHandlers() {
    if (0 == "Nayr's Japanese Core5000".localeCompare(deckName)) {
        deckNotes = core5000Modify(deckNotes, deckFields);
        return 1;
    }
    return 0;
}
