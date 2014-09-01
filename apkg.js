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

function displayRevlogOutputOptions() {
    var ul = d3.select("body")
                 .append("div")
                 .attr("id", "reviews")
                 .append("div")
                 .attr("id", "reviews-options")
                 .append("ul")
                 .attr("id", "reviews-options-list");
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

    //    return;
    /*
        sqlite = sqliteGlobal;
        var allModelsDecks = sqlite.exec('SELECT models,decks FROM col')[0].values[0];
        allModels = $.parseJSON(allModelsDecks[0]);
        allDecks = $.parseJSON(allModelsDecks[1]);
        var ul = d3.select('body').append('ul')
        ul.html('');
    */
    // return;
    var viz = ul.append('li').text('Visualization').attr("id", "viz-options");
    var vizDecks =
        viz.append("ul").append('li').text("Decks").append('ul').attr(
            "id", "viz-decks-list");
    var vizModels =
        viz.append("ul").append('li').text("With models").append('ul').attr(
            "id", "viz-models-list");

    // Data: elements of decksReviewed (which are {deck IDs -> object})
    var vizDecksList = vizDecks.selectAll("li")
                           .data(Object.keys(decksReviewed))
                           .enter()
                           .append("li")
                           .append('label')
                           .attr('for', function(d) { return 'viz-deck-' + d; })
                           .html(function(d, i) {
        var thisModels = Object.keys(decksReviewed[d]).map(
            function(mid) { return allModels[mid].name; });
        return '<input type="checkbox" checked id="viz-deck-' + d + '"> ' +
               allDecks[d].name + " (contains model" +
               (thisModels.length > 1 ? "s " : " ") + thisModels.join(",") +
               ")";
    });

    var vizModelsList =
        vizModels.selectAll("li")
            .data(Object.keys(modelsReviewed))
            .enter()
            .append("li")
            .text(function(mid) { return allModels[mid].name; });

    var vizFields =
        vizModelsList.selectAll("li")
            .data(function(d) { return allModels[d].flds; })
            .enter()
            .append("ul")
            .append("li")
            .append("label")
            .attr("for", function(d, i) { return 'viz-model-' + d + '-' + i; })
            .html(function(d, i) {
        return '<input type="checkbox" id="viz-model-' + d + '-' + i + '"> ' +
               d.name;
    });
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

// Note, this changes obj's parameters ("call by sharing") so the return value
// is purely a nicety: the object WILL be changed in the caller's scope.
function updateNestedObj(obj, outerKey, innerKey, innerVal) {
    if (!(outerKey in obj)) {
        obj[outerKey] = {};  // don't do {innerKey: innerKey} '_'
        obj[outerKey][innerKey] = innerVal;
    } else {
        if (!(innerKey in obj[outerKey])) {
            obj[outerKey][innerKey] = innerVal;
        }
    }
    return obj;
}

var sqliteGlobal;
var revlogTable;
var decksReviewed = {}, modelsReviewed = {}, allDecks, allModels;
function ankiSQLToRevlogTable(array, options) {
    if (typeof options === 'undefined') {
        options = {limit : 100, recent : true};
    }

    var sqliteBinary = new Uint8Array(array);
    var sqlite = new SQL.Database(sqliteBinary);
    sqliteGlobal = sqlite;

    // The deck name is in decks, and the field names are in models
    // which are JSON, and have to be handled outside SQL.
    var allModelsDecks = sqlite.exec('SELECT models,decks FROM col')[0].values[0];
    allModels = $.parseJSON(allModelsDecks[0]);
    allDecks = $.parseJSON(allModelsDecks[1]);

    // The reviews
    var query =
        'SELECT revlog.id, revlog.ease, revlog.time, notes.flds, notes.sfld, cards.id, cards.reps, cards.lapses, cards.did, notes.mid, cards.ord \
FROM revlog \
LEFT OUTER JOIN cards ON revlog.cid=cards.id \
LEFT OUTER JOIN notes ON cards.nid=notes.id \
ORDER BY revlog.id' +
        (options.recent ? " DESC " : "") +
        (options.limit && options.limit > 0 ? " LIMIT " + options.limit : "");
    var queryResultNames =
        "revId,ease,timeToAnswer,noteFacts,noteSortKeyFact,cardId,reps,lapses,deckId,\
modelId,templateNum".split(',');

    // Run the query and convert the resulting array of arrays into an array of
    // objects
    revlogTable = sqlite.exec(query)[0].values;

    var unknownDeckString = "unknown deck";
    var unknownNoteString = "unknown note facts";
    var unknownModelString = "unknown model";
    // TODO add "Date of first review" field
    revlogTable = revlogTable.map(function(rev) {
        // First, convert this review from an array to an object
        rev = arrayNamesToObj(queryResultNames, rev);

        // Add deck name
        rev.deckName = rev.deckId ? allDecks[rev.deckId].name : unknownDeckString;

        // Convert facts string to a fact object
        var fieldNames =
            rev.modelId
                ? allModels[rev.modelId].flds.map(function(f) { return f.name; })
                : null;
        rev.noteFacts =
            rev.noteFacts ? arrayNamesToObj(fieldNames,
                                            rev.noteFacts.split(ankiSeparator))
                          : unknownNoteString;
        // Add model name
        rev.modelName =
            rev.modelId ? allModels[rev.modelId].name : unknownModelString;
        // delete rev.modelId;

        // Decks need to know what models are in them. decksReviewed is an
        // object of objects: what matters are the keys, at both levels, not the
        // values. TODO can this be done faster in SQL?
        updateNestedObj(decksReviewed, rev.deckId, rev.modelId, rev.modelName);
        // But let's also keep track of models in the same way, since we're lazy
        // FIXME
        updateNestedObj(modelsReviewed, rev.modelId, rev.deckId, rev.deckName);

        // Add review date
        rev.date = new Date(rev.revId);
        rev.dateString = rev.date.toString();

        // Add a JSON representation of facts
        rev.noteFactsJSON = typeof rev.noteFacts === "object"
                                ? JSON.stringify(rev.noteFacts)
                                : unknownNoteString;

        // Switch timeToAnswer from milliseconds to seconds
        rev.timeToAnswer /= 1000;

        return rev;
    });

    /*
    // decks and models that are only associated with reviews. Will this be
    // faster in sql.js or inside plain Javascript? TODO find out.
    var modelIDsReviewed = sqlite.exec(
                                      "SELECT DISTINCT notes.mid \
FROM revlog \
LEFT OUTER JOIN cards ON revlog.cid=cards.id \
LEFT OUTER JOIN notes ON cards.nid=notes.id")[0].values;
    modelsReviewed = modelIDsReviewed.map(function(mid) {
        return mid[0] ? allModels[mid[0]].name : unknownModelString;
    });
    modelIdToName =
        arrayNamesToObj(modelIDsReviewed.map(_.first), modelsReviewed);

    var deckIDsReviewed = sqlite.exec(
                                     "SELECT DISTINCT cards.did \
FROM revlog \
LEFT OUTER JOIN cards ON revlog.cid=cards.id")[0].values;
    decksReviewed = deckIDsReviewed.map(function(did) {
        return did[0] ? allDecks[did[0]].name : unknownDeckString;
    });
    deckIdToName = arrayNamesToObj(deckIDsReviewed.map(_.first), decksReviewed);
    */

    // Create div for results
    displayRevlogOutputOptions();
}

function reduceRevlogTable(deckIDsWanted, modelIDsWanted, logicalOpDeckModel) {
    // See if revlogTable is sorted ascending or descending by examining the
    // first two elements.
    // NB. This will fail if the SQL query isn't sorted by time!
    var oldestFirst = revlogTable[0].date < revlogTable[1].date;

    // We wanted to know whether the oldest came first or last because a key
    // element of this visualization is the date each note was learned.

    // Build the cardId-indexed array using reduce since it can reduce (left)
    // or reduceRight. Just accumulate the individual reviews. We don't need to
    // keep track of dates, or lapses, or total reps since the database gave us
    // that.
    var uniqueKeysSeenSoFar = 0;
    var temporalIndexToCardArray = [];
    var revDb;

    var reductionFunction = function(dbSoFar, rev, idx) {
        var key = rev.cardId;
        if (logicalOpDeckModel(
                deckIDsWanted && deckIDsWanted.indexOf(rev.deckId) < 0,
                modelIDsWanted && modelIDsWanted.indexOf(rev.modelId) < 0)) {
            return dbSoFar;
        }

        if (key in dbSoFar) {
            // Already seen this card ID
            dbSoFar[key].allRevlogs.push(rev);
        } else {
            // Fist time seeing this card ID
            dbSoFar[key] = {
                allRevlogs : [rev],
                reps : rev.reps,
                lapses : rev.lapses,
                dateLearned : rev.date,
                noteFacts : rev.noteFacts,
                temporalIndex : uniqueKeysSeenSoFar
            };
            temporalIndexToCardArray[uniqueKeysSeenSoFar] = key;
            uniqueKeysSeenSoFar++;
        }
        return dbSoFar;
    };

    // We know whether to reduce or reduceRight
    if (oldestFirst) {
        revDb = revlogTable.reduce(reductionFunction, {});
    } else {
        revDb = revlogTable.reduceRight(reductionFunction, {});
    }

    return {
        revDb : revDb,
        temporalIndexToCardArray : temporalIndexToCardArray
    };
}

var revDb, temporalIndexToCardArray;
function revlogVisualizeProgress() {
    // This function needs to take, as logical inputs, the decks and models to
    // limit the visualization to, plus a boolean operation AND or OR to combine
    // the two, and finally a way to display the pertinent facts about a card so
    // that cards are better-distinguished than card IDs (a long nunmber).
    var deckIDsWanted = [];
    var modelIDsWanted = [];
    var logicalOpDeckModel = function(x, y) { return x && y; };
    var displayFacts = "Kanji".split(',');

    revDb =
        reduceRevlogTable(deckIDsWanted, modelIDsWanted, logicalOpDeckModel);
    temporalIndexToCardArray = revDb.temporalIndexToCardArray;
    revDb = revDb.revDb;

    // So now we've generated an object indexed by whatever keyFactId was chosen
    // (and potentially restricted to a deck/model) that tells us performance
    // details about each card. Sibling cards are currently treated as different
    // cards: TODO: allow user to select treating them as the same card.

    d3.select("#reviews").append("div").attr("id", "chart");
    d3.select("#reviews").append("div").attr("id", "histogram");
    d3.select("#reviews").append("div").attr("id", "scatter-rep-lapse");
    d3.select("#reviews").append("div").attr("id", "scatter-norm-rep-lapse");

    //------------------------------------------------------------------------
    // Pass rate per unique card
    //------------------------------------------------------------------------
    // Generate the column-wise array of arrays that c3js wants
    var chartArr = _.map(revDb, function(val, key) {
        return [ val.dateLearned, 1 + val.temporalIndex ];
    });
    chartArr.unshift(['date', 'card index']);

    // Invoke the c3js method
    var chart = c3.generate({
        bindto : '#chart',
        data : {
                 x : 'date',
                 rows : chartArr,
                 onmouseover :
                     function(d, i) {
                         $('.c3-circle-' + d.index).css({
                             "stroke-width": 3
                         });
                     },
                 onmouseout :
                     function(d, i) {
                         $('.c3-circle-' + d.index).css({
                             "stroke-width": 1
                         });
                     }
               },
        axis : {
                 y : {label : {text : "Card index"}},
                 x : {
                     type : 'timeseries',
                     label : {text : "Date"},
                     tick : {
                         rotate : 10,
                         height : 1300,
                         format : '%Y-%m-%d %I:%M'
                     }
                 }
               },
        tooltip : {
                    format : {
                        value : function(value, ratio, id) {
                            // value: 1-index!
                            var key = temporalIndexToCardArray[value-1];
                            var reps = revDb[key].reps;
                            var lapses = revDb[key].lapses;
                            return temporalIndexToCardArray[value - 1] +
                                   " (#" + (value - 1 + 1) + ", " + lapses +
                                   '/' + reps + "reps missed)";
                        }
                    }
                  },
        legend : {show : false},
        zoom : {
                 enabled : true,
                 extent : [
                     1,
                     2
                 ]
               },  // default is [1,10] doesn't provide enough zoooooom
        point : {focus : {expand : {enabled : false}}} // don't expand a point on focus
    });

    // Make the radius and opacity of each data circle depend on the pass rate
    var grader =
        function(dbentry) { return 1 - dbentry.lapses / dbentry.reps; };
    var worstRate = grader(_.min(revDb, grader));
    var scaleRadius = d3.scale.linear().domain([ worstRate - .005, 1 ]).range([ 2, 45 ]);
    var scaleOpacity =
        d3.scale.linear().domain([ worstRate, 1 ]).range([ 1, .05 ]);

    // The following helps smooth out the diversity of radii and opacities by
    // putting more slope in the linear scale where there's more mass in the
    // histogram, so when there's lots of things with about the same value,
    // they'll have more different radii/opacities than they would otherwise. It
    // looks good, but it depends on the user's data, and requires some
    // automatic histogram analysis: TODO.
    if (false) {
        var lin = d3.scale.linear().domain([ 0, 1 ]).range(scaleRadius.range());
        scaleRadius =
            d3.scale.linear()
                .domain([ worstRate, .85, .93, .96, 1 ])
                .range([ lin(0), lin(.2), lin(.8), lin(.99), lin(1) ]);
        lin = d3.scale.linear().domain([ 0, 1 ]).range(scaleOpacity.range());
        scaleOpacity =
            d3.scale.linear()
                .domain([ worstRate, .85, .93, .96, 1 ])
                .range([ lin(0), lin(.2), lin(.8), lin(.99), lin(1) ]);
    }

    temporalIndexToCardArray.forEach(function(value, idx) {
        var dbentry = revDb[temporalIndexToCardArray[idx]];
        var rate = grader(dbentry);
        // if (idx>=557) {debugger;}
        d3.select('.c3-circle-' + idx).attr({
            'r' : scaleRadius(rate),
            //'fill-opacity' : 0,
            //'fill' : 'none',
            'stroke-opacity' : scaleOpacity(rate)
        });
    });
    $('.c3-circle').css({stroke : 'rgb(31,119,180)', fill: "none", "fill-opacity": 0});

    //------------------------------------------------------------------------
    // Histogram of pass rates
    //------------------------------------------------------------------------
    var numBins = 20;
    var histData = d3.layout.histogram().bins(scaleRadius.ticks(numBins))(
        _.map(revDb, grader));
    var chartHistData = _.map(histData, function(bar) { return [ bar.x, bar.y ]; });
    chartHistData.unshift([ 'x', 'frequency' ]);
    var hist = c3.generate({
        bindto : '#histogram',
        data : {x : 'x', rows : chartHistData, type : "bar"},
        bar : {width : {ratio : .95}},
        axis : {
                 y : {label : {text : "Number of cards"}},
                 x : {
                     label : {text : "Pass rate"},

                 }
               },
        legend : {show : false}
    });

    //-----------------
    // Time to failure plots
    //--------------------
    var unitRandom = function() { return (Math.random() - 0.5) * .5; };
    var lapsesReps = temporalIndexToCardArray.map(
        function(key, idx){return [ revDb[key].lapses + unitRandom(), revDb[key].reps + unitRandom()]});
    lapsesReps.unshift(['lapses', 'reps']);
    var lapsesRepsChart = c3.generate({
        bindto : '#scatter-rep-lapse',
        data : {x : 'reps', rows : lapsesReps, type : "scatter"},
        axis : {
                 x : {label : {text : "# reps, integer with jitter"}, tick : {fit : false}},
                 y : {label : {text : "# lapses, integer with jitter"}}
               },
        legend : {show : false}
    });

    //-----------
    // Normalized
    //-----------
    var current = new Date().getTime();
    var dayDiff = function(initial) {
        return (current - initial.getTime()) / (1000 * 3600 * 24);
    };
    jitteredTimeToCard = {};
    var lapsesTime = temporalIndexToCardArray.map(function(key, idx) {
        var jitteredTime = dayDiff(revDb[key].dateLearned) + unitRandom();
        jitteredTimeToCard[jitteredTime] = key;
        return [ revDb[key].lapses + unitRandom(), jitteredTime ];
    });
    lapsesTime.unshift([ 'lapses', 'daysKnown' ]);

    /*
    var lapsesTimesTranspose = [];
    for (var inputCol = 0;inputCol < lapsesTime[0].length; inputCol++) {
        lapsesTimesTranspose[inputCol] = [];
        for (var inputRow = 0; inputRow < lapsesTime.length; inputRow++) {
            lapsesTimesTranspose[inputCol][inputRow] = lapsesTime[inputRow][inputCol];
        }
    }
    */ /*data --> columns : lapsesTimesTranspose*/

    var lapsesDaysChart = c3.generate({
        bindto : '#scatter-norm-rep-lapse',
        data : {x : 'daysKnown', rows : lapsesTime, type : "scatter"},
        axis : {
                 x : {
                       label : {text : "days known, with jitter"},
                       tick : {fit : false}
                     },
                 y : {label : {text : "# lapses, with jitter"}}
               },
        legend : {show : false},
        tooltip :
            {
              contents :
                  function(d, defaultTitleFormat, defaultValueFormat, color) {
                      var key = jitteredTimeToCard[d[0].x];
                      this.config.tooltip_format_title = function(d) {
                          return "Known for " + d3.round(d) + " days (" + key +
                                 ")";
                      };
                      this.config.tooltip_format_value =
                          function(value, ratio, id) {
                              return d3.round(value) + " (" + key + ")";
                      };
                      var retval = this.getTooltipContent
                                       ? this.getTooltipContent(
                                             d, defaultTitleFormat,
                                             defaultValueFormat, color)
                                       : '';
                      return retval;
                  },
              format : {
                  title :
                      function(d) {
                          return "Known for " + d3.round(d) + " days";
                      },
                  name :
                      function(id) {
                          if (id === "lapses") {
                              return "Lapses";
                          }
                          return "Card key";
                      },
                  value :
                      function(value, ratio, id) {
                          if (id === "lapses") {
                              return d3.round(value);
                          }
                          return temporalIndexToCardArray[value];
                      }
              }
            },
        zoom : {enabled : true, extent : [ 1, 2 ]}
    });
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

var summer = function(arr) {
    return _.reduce(arr, function(memo, num) { return memo + num; }, 0);
};
var mean = function(arr) { return summer(arr) / arr.length; };