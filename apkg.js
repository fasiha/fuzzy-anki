function appendScript(url) {
    var s = document.createElement("script");
    s.type = "text/javascript";
    s.src = url;
    $("head").append(s);
}
// Jquery already available on Ankiweb.net
// appendScript("http://ajax.googleapis.com/ajax/libs/jquery/1.10.2/jquery.min.js");
appendScript("https://rawgit.com/mbostock/d3/blob/master/d3.min.js");
appendScript("https://kripken.github.io/sql.js/js/sql.js")
appendScript("https://rawgit.com/imaya/zlib.js/master/bin/unzip.min.js")

var deckNotes;
var deckFields;
var deckName;
var ankiSeparator = '\x1f';

// Huge props to http://stackoverflow.com/a/9507713/500207
function tabulate(data, columns, containerString) {
    var table = d3.select(containerString).append("table"),
        thead = table.append("thead"),
        tbody = table.append("tbody");

    // append the header row
    thead.append("tr")
        .selectAll("th")
        .data(columns)
        .enter()
        .append("th")
            .text(function(column) { return column; });

    // create a row for each object in the data
    var rows = tbody.selectAll("tr")
        .data(data)
        .enter()
        .append("tr");

    // create a cell in each row for each column
    var cells = rows.selectAll("td")
        .data(function(row) {
            return columns.map(function(column) {
                return {column: column, value: row[column]};
            });
        })
        .enter()
        .append("td")
            .html(function(d) { return d.value; });

    return table;
}

function sqlToTable(uInt8ArraySQLdb) {
    var db = new SQL.Database(uInt8ArraySQLdb);

    col = db.exec("SELECT * FROM col");
    var modelsFunction = Function('return ' + col[0].values[0][9]);
    var models = modelsFunction();

    var fnames = [];
    for (key in models) {
        if (models.hasOwnProperty(key)) {
            // This should happen only once.
            deckName = models[key].name;
            models[key].flds.forEach(function (val, idx, arr) {
                fnames.push(val.name);
            });
        }
    }
    deckFields = fnames;

    // Notes table
    deckNotes = db.exec("SELECT * FROM notes");

    // Visualize!
    d3.select("#anki").append("h1").text(deckName);
    //d3.select("#anki").append("div").text(deckFields);

    // Actual notes
    var notes = [];
    var arrayToObj = function(facts) {
        var myObj = {};
        for (var i = 0; i < facts.length; i++) {
            myObj[deckFields[i]] = facts[i];
        }
        return myObj;
    }
    deckNotes[0].values.forEach(function (val) {
        notes.push(arrayToObj(val[6].split(ankiSeparator)));
    });
    deckNotes = notes;
    tabulate(deckNotes, deckFields, "#anki");
}

function ankiPackageToTable(ankiURL) {
    var zipxhr = new XMLHttpRequest();
    zipxhr.open('GET', ankiURL, true);
    zipxhr.responseType = 'arraybuffer';
    zipxhr.onload = function(e) {
        var compressed = new Uint8Array(this.response);
        var unzip = new Zlib.Unzip(compressed);
        var filenames = unzip.getFilenames();
        if (filenames.indexOf("collection.anki2") >= 0) {
            var plain = unzip.decompress("collection.anki2");
            sqlToTable(plain);
        }
    }
    zipxhr.send();
}
