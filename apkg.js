var deckNotes;
var deckFields;
var deckName;
var ankiSeparator = '\x1f';

// Huge props to http://stackoverflow.com/a/9507713/500207
function tabulate(datatable, columns, containerString) {
    var table = d3.select(containerString).append("table"),
        thead = table.append("thead"), tbody = table.append("tbody");

    // append the header row
    thead.append("tr").selectAll("th").data(columns).enter().append("th").text(
        function(column) { return column; });

    // create a row for each object in the data
    var rows = tbody.selectAll("tr").data(datatable).enter().append("tr");

    // create a cell in each row for each column
    var cells = rows.selectAll("td").data(function(row) {
        return columns.map(function(column) {
            return {column : column, value : row[column]};
        });
    }).enter().append("td").html(function(d) { return d.value; });

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

    // Visualize!
    d3.select("#anki").append("h1").text(deckName);

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
    if (0 == runPreHandlers()) {
        tabulate(deckNotes, deckFields, "#anki");
    }

    // core5000Modify(deckName, deckNotes, deckFields);
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

    ankiURLToTable('/n.apkg');
});

function core5000Modify(deckNotes, deckFields) {
    var kanaRegexp = XRegExp('\\[([\\p{Hiragana}\\p{Katakana}]+)\\]', 'g');

    var abbreviations =
        "adn.,adv.,aux.,conj.,cp.,i-adj.,interj.,n.,na-adj.,num.,p.,p. \
case,p. conj.,p. disc.,pron.,v.".split(',');
    var abbreviationsOr = abbreviations.join("|").replace(/\./g, '\\.');

    var kanaKanjiWordRegexp = '([^a-z]+)';
    var romajiRegexp = '([a-z\\s,\\-()’]+)';
    var partOfSpeechRegexp = '((?: |,|' + abbreviationsOr + ')+)';

    var bar = function(s) {
        var arr = s.split(XRegExp('(' + abbreviationsOr + ')'));

        var isAbbreviation = arr.map(
            function(x) { return abbreviations.indexOf(x) >= 0 ? 1 : 0; });
        var isWhitePunctuation =
            arr.map(function(x) { return x.match(/^[\s,]*$/) ? 1 : 0; });
        var isAbbrOrWhitePunct = isAbbreviation.map(
            function(x, i) { return x + isWhitePunctuation[i]; });

        var tmp = removeJunk(isAbbrOrWhitePunct, arr);
        arr = tmp.other_array;
        isAbbrOrWhitePunct = tmp.this_array;

        var pos = [];
        var translation = [];
        arr.map(function(x, i) {
            if (isAbbrOrWhitePunct[i]) {
                pos.push(x);
                translation.push(arr[i + 1]);
            }
        });

        var kanaKanjiMatch =
            s.match(XRegExp(kanaKanjiWordRegexp + ' ' + romajiRegexp + ' ' +
                            partOfSpeechRegexp));
        return {
            pos : pos,
            translation : translation,
            word : kanaKanjiMatch[1],
            romaji : kanaKanjiMatch[2]
        };
    };

    function removeJunk(this_array, other_array) {
        var i = 1;
        while (i < this_array.length) {
            if (this_array[i] == this_array[i - 1] && this_array[i] > 0) {
                this_array.splice(i - 1, 2, 1);
                other_array.splice(i - 1, 2,
                                   other_array[i - 1] + other_array[i]);
            } else {
                i++;
            }
        }
        return {other_array : other_array, this_array : this_array};
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
        var arr = s.match(
            XRegExp('([^a-z]+)([^\\p{Han}\\p{Katakana}\\p{Hiragana}]+)', 'g'));

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

    deckNotes.map(function(note, loc, arr) {
        // Replace [kana] with spans
        note.Reading = note.Reading.replace(kanaRegexp,
                                            function(match, kana, offset, str) {
            return '<span class="reading kana">' + kana + '</span>';
        });

        // Break up Word column into its four separate components
        note.Word = wordColumnReplace(note.Word);

        return note;
    });

    d3.select("body").append("div").attr("id", "core5000");
    tabulate(deckNotes, deckFields, "#core5000");

    return deckNotes;
}

function runPreHandlers() {
    if (0 == "Nayr's Japanese Core5000".localeCompare(deckName)) {
        core5000Modify(deckNotes, deckFields);
        return 1;
    }
    return 0;
}