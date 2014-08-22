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
        d3.select("#anki").append("h1").text(deckName);
        tabulate(deckNotes, deckFields, "#anki");
    }
}

function ankiBinaryToTable(ankiArray) {
    var compressed = new Uint8Array(ankiArray);
    var unzip = new Zlib.Unzip(compressed);
    var filenames = unzip.getFilenames();
    if (filenames.indexOf("collection.anki2") >= 0) {
        var plain = unzip.decompress("collection.anki2");
        sqlToTable(plain);
    }
}

function ankiURLToTable(ankiURL) {
    var zipxhr = new XMLHttpRequest();
    zipxhr.open('GET', ankiURL, true);
    zipxhr.responseType = 'arraybuffer';
    zipxhr.onload = function(e) { ankiBinaryToTable(this.response); };
    zipxhr.send();
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
        reader.onload = function(e) { ankiBinaryToTable(e.target.result); };
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

    $("#ankiFile").change(eventHandleToTable);

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
    d3.select("#core5000").append("h1").text(deckName);

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
    // part-of-speech-and-translation pairs.
    var kanaKanjiWordRegexp = '([^a-z]+)';
    var romajiRegexp = '([a-z\\s,\\-()’]+)';
    var partOfSpeechRegexp = '((?: |,|' + abbreviationsOr + ')+)';

    // This string's regexp is used to separate multiple sequences of #1--#4
    // above. All these strings intended to become regexps will go through
    // XRegExp, which expands out the Han/Katakana/Hiragana groups.
    var completeWordRegexp =
        '([^a-z]+)([^\\p{Han}\\p{Katakana}\\p{Hiragana}]+)';

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

    function decodeHtml(html) {
        var txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    }

    var wordColumnReplace = function(s) {
        if (s.search("&") >= 0) {
            s = decodeHtml(s);
        }
        var arr = s.match(XRegExp(completeWordRegexp, 'g'));

        return arr.map(function(s) {
            var decomp = bar(s);
            var posTrans = decomp.pos.map(function(pos, i) {
                return '<span class="part-of-speech">' + pos +
                       '</span> <span class="target-words-meaning">' +
                       decomp.translation[i] + '</span>';
            }).join(" ");
            return '<span class="target-words">' + decomp.word +
                   '</span> <span class="target-words-romaji">' +
                   decomp.romaji + " " + posTrans + '</span>'
        }).join("");
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
        "th.field-Meaning, th.field-Sound {font-size: 10%}\
th.field-Frequency-Order {font-size:50%}\
td.field-Expression, td.field-Reading {font-size: 150%}\
td.field-English-Translation, td.field-Word {font-size: 75%}");

    return deckNotes;
}

function specialDisplayHandlers() {
    if (0 == "Nayr's Japanese Core5000".localeCompare(deckName)) {
        core5000Modify(deckNotes, deckFields);
        return 1;
    }
    return 0;
}