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
    var cells = rows.selectAll("td")
                    .data(function(row) {
                        return columns.map(function(column) {
                            return {column : column, value : row[column]};
                        });
                    })
                    .enter()
                    .append("td")
                    .html(function(d) { return d.value; });

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
    }
    deckNotes[0].values.forEach(
        function(val) { notes.push(arrayToObj(val[0].split(ankiSeparator))); });
    deckNotes = notes;

    // Visualize!
    tabulate(deckNotes, deckFields, "#anki");

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
    zipxhr.onload = function(e) { ankiBinaryToTable(this.response); }
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
        reader.onload = function(e) {
            ankiBinaryToTable(e.target.result);
        };
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
});

function core5000Modify(deckName, deckNotes, deckFields) {
    if (0 == "Nayr's Japanese Core5000".localeCompare(deckName)) {
        // Very, very sorry for using eval(), but clang-format as of LLVM 3.4.2
        // doesn't handle Javascript regexps, though it's fixed in Subversion as
        // of May 2014:
        // http://lists.cs.uiuc.edu/pipermail/cfe-commits/Week-of-Mon-20140512/105327.html
        eval('var kanaRegexp = /\\[([あ-んア-ン]+)\\]/g;');

        var abbreviations =
            "adn.,adv.,aux.,conj.,cp.,i-adj.,interj.,n.,na-adj.,num.,p.,p. "
            "case,p. conj.,p. disc.,pron.,v.".split(',');
        var kanaKanji = XRegExp('([\\p{Han}\\p{Katakana}\\p{Hiragana}]+) ');

        // COMBINE THESE TWO!

        deckNotes.map(function(note, loc, arr) {
            // Replace [kana] with spans
            note.Reading = note.Reading.replace(
                kanaRegexp, function(match, kana, offset, str) {
                    return '<span class="reading kana">' + kana + '</span>';
                });

            
            return note;
        });

        d3.select("body").append("div").attr("id", "core5000");
        tabulate(deckNotes, deckFields, "#core5000");

    }
    return deckNotes;
}