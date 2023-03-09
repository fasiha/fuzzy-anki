var GLOBAL_CORS_PROXY = "http://cors-anywhere.herokuapp.com/";
var ankiSeparator = '\x1f';

// deckNotes contains the contents of any APKG decks uploaded. It is an array of
// objects with the following properties:
// - "name", a string
// - "fieldNames", an array of strings
// - "notes", an array of objects, each with properties corresponding to the
// entries of fieldNames.
var deckNotes;
var SQL;

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

    // Decks table (for deck names)
    decks = db.exec("SELECT decks FROM col");
    // Could use parseJSON from jQuery here.
    decks = Function('return ' + decks[0].values[0][0])();

    // Models table (for field names)
    col = db.exec("SELECT models FROM col");
    // Could use parseJSON from jQuery here.
    var models = Function('return ' + col[0].values[0][0])();

    // Notes table, for raw facts that make up individual cards
    deckNotes = db.exec("SELECT mid,flds FROM notes");

    _.each(_.keys(models), function(key) {
        models[key].fields = _.pluck(models[key].flds, 'name');
    });

    var notesByModel =
        _.groupBy(deckNotes[0].values, function(row) { return row[0]; });

    deckNotes = _.map(notesByModel, function(notesArray, modelId) {
        var modelName = models[modelId].name;
        var fieldNames = models[modelId].fields;
        var notesArray = _.map(notesArray, function(note) {
            var fields = note[1].split(ankiSeparator);
            return arrayNamesToObj(fieldNames, fields);
        });
        return {name : modelName, notes : notesArray, fieldNames : fieldNames};
    });

    // Visualize!
    if (0 == specialDisplayHandlers()) {
        _.each(deckNotes, function(model, idx) {
            d3.select("#anki").append("h2").text(model.name);
            var deckId = "deck-" + idx;
            d3.select("#anki").append("div").attr("id", deckId);
            tabulate(model.notes, model.fieldNames, "#" + deckId);
            arrToCSV(model.notes, model.fieldNames, "Download CSV", d3.select("#" + deckId))
        });
    }
}

function parseImages(imageTable,unzip,filenames){
    var map = {};
    for (var prop in imageTable) {
      if (filenames.indexOf(prop) >= 0) {
        var file = unzip.decompress(prop);
        map[imageTable[prop]] = converterEngine (file);
      }
    }
    d3.selectAll("img")
      .attr("src", function(d,i) {
        //Some filenames may be encoded. Decode them beforehand.
        var key = decodeURI(this.src.split('/').pop());
        if (key in map){
          return "data:image/png;base64,"+map[key];
        }
          return this.src;
      });
}

function converterEngine (input) { // fn BLOB => Binary => Base64 ?
  // adopted from https://github.com/NYTimes/svg-crowbar/issues/16
    var uInt8Array = new Uint8Array(input),
        i = uInt8Array.length;
    var biStr = []; //new Array(i);
    while (i--) {
        biStr[i] = String.fromCharCode(uInt8Array[i]);
    }
    var base64 = window.btoa(biStr.join(''));
    return base64;
};

function ankiBinaryToTable(ankiArray, options) {
    var compressed = new Uint8Array(ankiArray);
    var unzip = new Zlib.Unzip(compressed);
    var filenames = unzip.getFilenames();
    var anki21Exists = filenames.indexOf("collection.anki21") >= 0;
    var sqliteFile = anki21Exists ? "collection.anki21" : "collection.anki2";
    if (filenames.indexOf(sqliteFile) >= 0) {
        var plain = unzip.decompress(sqliteFile);
        sqlToTable(plain);
        if (options && options.loadImage){
          if (filenames.indexOf("media") >= 0) {
              var plainmedia = unzip.decompress("media");
              var bb = new Blob([new Uint8Array(plainmedia)]);
              var f = new FileReader();
              f.onload = function(e) {
                parseImages(JSON.parse(e.target.result),unzip,filenames);
              };
              f.readAsText(bb);
          }
        }
    }
}

function ankiURLToTable(ankiURL, options, useCorsProxy, corsProxyURL) {
    if (typeof useCorsProxy === 'undefined') {
        useCorsProxy = false;
    }
    if (typeof corsProxyURL === 'undefined') {
        corsProxyURL = GLOBAL_CORS_PROXY;
    }

    var zipxhr = new XMLHttpRequest();
    zipxhr.open('GET', (useCorsProxy ? corsProxyURL : "") + ankiURL, true);
    zipxhr.responseType = 'arraybuffer';
    zipxhr.onload = function(e) { ankiBinaryToTable(this.response, options); };
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

    var viz = ul.append('li')
                  .attr("id", "viz-options");

    viz.append("button").text('Visualize performance').on("click", function() {
        var selectedFields = d3.selectAll("#viz-models-list > li.viz-model")
                                 .selectAll("input:checked");
        var config = selectedFields.map(function(mod) {
            mid = /[0-9]+/.exec(mod.parentNode.id)[0];
            fs = mod.map(function(sub) {
                var fnum = /field-([0-9]+)/.exec(sub.id)[1];
                return allModels[mid].flds[fnum].name;
            });
            return {modelID : mid, fieldNames : fs};
        });
        config = arrayNamesToObj(_.pluck(config, "modelID"),
                                 _.pluck(config, "fieldNames"));

        revlogVisualizeProgress(config, getSelectedDeckIDs());
    });

    var vizDecks =
        viz.append("ul").append('li').text("Select decks to analyze").append('ul').attr(
            "id", "viz-decks-list");
    var vizModels = viz.append("ul")
                        .append('li')
                        .text(
                             "Select fields for each model to display in plots")
                        .append('ul')
                        .attr("id", "viz-models-list");

    // Data: elements of decksReviewed (which are {deck IDs -> object})
    // TODO: enable visualization of unknown decks: .data(Object.keys(decksReviewed))
    var decksReviewedKeysAlphabetized =
        _.sortBy(Object.keys(_.omit(decksReviewed, null)), function(did) {
            return allDecks[did] ? allDecks[did].name : "zzzUnknown";
        });
    var vizDecksList = vizDecks.selectAll("li")
                           .data(decksReviewedKeysAlphabetized)
                           .enter()
                           .append("li")
                           .append('label')
                           .attr('for', function(d) { return 'viz-deck-' + d; })
                           .html(function(d, i) {
        var thisModels =
            _.filter(Object.keys(decksReviewed[d]).map(function(mid) {
            return d !== "null" ? allModels[mid].name : null;
        }), null);
        return '<input type="checkbox" checked id="viz-deck-' + d + '"> ' +
               (d !== "null" ? allDecks[d].name : "Unknown deck") +
               (thisModels.length > 0
                    ? " (contains model" +
                          (thisModels.length > 1 ? "s " : " ") +
                          thisModels.join(", ") + ")"
                    : "");
    });

    $('#viz-deck-null').attr("checked", false);

    $('#viz-decks-list input:checkbox')
        .click(function() { updateModelChoices(); });
    updateModelChoices();
}

function getSelectedDeckIDs() {
    var selectedDecks = _.pluck($('#viz-decks-list input:checked'), 'id');
    // In case the above is too fancy across browsers, this is equivalent:
    // `$.map($('#viz-decks-list input:checked'), function(x){return x.id;})`

    var selectedDeckIDs = selectedDecks.map(function(id) {
        return id !== "viz-deck-null" ? /[0-9]+/.exec(id)[0] : null;
    });
    return selectedDeckIDs;
}

function updateModelChoices() {
    var selectedDeckIDs = getSelectedDeckIDs();

    var modelIDs = _.union(_.flatten(_.map(selectedDeckIDs.map(function(did) {
        return decksReviewed[did];
    }), function(val) { return Object.keys(val); })));

    var vizModels = d3.select("#viz-models-list");
    var modelsData = vizModels.selectAll("li.viz-model")
                         .data(modelIDs, function(mid) { return mid; });
    // For an explanation of the CSS class 'viz-model' see
    // http://stackoverflow.com/a/25599142/500207

    modelsData.exit().remove();

    var vizModelsList =
        modelsData.enter()
            .append("li")
            .attr("id", function(mid) { return "viz-model-" + mid; })
            .text(
                 function(mid) {
                     return mid !== "null" ? allModels[mid].name
                                           : "Unknown model";
                 })
            /*.on("click", function(mid) {
                $('#viz-model-' + mid + '-list').slideToggle();
            })*/
            .classed("viz-model",
                     true).append("ul").append("li");

    var vizFields =
        vizModelsList.selectAll("span")
            .data(
                 function(d) {
                     return d !== "null"
                                ? (_.pluck(allModels[d].flds, 'name').map(
                                      function(name, idx) {
                                          return {
                                              name : name,
                                              modelId : d,
                                              total : allModels[d].flds.length
                                          };
                                      }))
                                : [];
                 })
            .enter()
            .append("span")
            .classed("viz-field-span", true)
            .append("label")
            .attr("for", function(d, i) {
                return 'viz-model-' + d.modelId + '-field-' + i;
            })
            .html(function(d, i) {
        return '<input type="checkbox" id="viz-model-' + d.modelId + '-field-' +
               i + '"> ' + d.name + (i + 1 < d.total ? ', ' : "");
    });
}

function arrToCSV(dataArray, fieldsArray, linkText, d3SelectionToAppend) {
    var csv = convert(dataArray, fieldsArray);
    var blob = new Blob([csv], {type : 'data:text/csv;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    return d3SelectionToAppend.append("a")
        .attr("href", url)
        .text(linkText);
}

function generateReviewsCSV() {
    var d3Selection = arrToCSV(
        revlogTable,
        "dateString,ease,interval,lastInterval,timeToAnswer,noteSortKeyFact,deckName,modelName,lapses,\
reps,cardId,noteFactsJSON".split(','),
        "Download CSV", d3.select("#export-request").append("li").attr(
                            "id", "export-completed"));
    d3Selection.classed('csv-download', true);
}

function tabulateReviews() {
    tabulate(revlogTable,
             "date,ease,interval,lastInterval,timeToAnswer,noteSortKeyFact,deckName,modelName,lapses,\
reps,cardId,noteFactsJSON".split(','),
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
        'SELECT revlog.id, revlog.ease, revlog.ivl, revlog.lastIvl, revlog.time, notes.flds, notes.sfld, cards.id, cards.reps, cards.lapses, cards.did, notes.mid, cards.ord \
FROM revlog \
LEFT OUTER JOIN cards ON revlog.cid=cards.id \
LEFT OUTER JOIN notes ON cards.nid=notes.id \
ORDER BY revlog.id' +
        (options.recent ? " DESC " : "") +
        (options.limit && options.limit > 0 ? " LIMIT " + options.limit : "");
    var queryResultNames =
        "revId,ease,interval,lastInterval,timeToAnswer,noteFacts,noteSortKeyFact,cardId,reps,lapses,deckId,\
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

function reduceRevlogTable(deckIDsWanted) {
    deckIDsWanted = deckIDsWanted.map(function(i) { return parseInt(i); });

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
        if (deckIDsWanted && deckIDsWanted.indexOf(rev.deckId) < 0) {
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
                cardId: rev.cardId,
                modelId : rev.modelId,
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

function cardAndConfigToString(cardObj, config) {
    return config[cardObj.modelId].length > 0
               ? (config[cardObj.modelId]
                      .map(function(
                          factName) { return cardObj.noteFacts[factName]; })
                      .join(', '))
               : ("card ID: " + cardObj.cardId);
}

var revDb, temporalIndexToCardArray;
function revlogVisualizeProgress(configModelsFacts, deckIDsWanted) {
    // This function needs to take, as logical inputs, the decks and models to
    // limit the visualization to, plus a boolean operation AND or OR to combine
    // the two, and finally a way to display the pertinent facts about a card so
    // that cards are better-distinguished than card IDs (a long nunmber).
    if (typeof deckIDsWanted === undefined) {
        deckIDsWanted = [];
    }

    revDb = reduceRevlogTable(deckIDsWanted);
    temporalIndexToCardArray = revDb.temporalIndexToCardArray;
    revDb = revDb.revDb;

    // So now we've generated an object indexed by whatever keyFactId was chosen
    // (and potentially restricted to a deck/model) that tells us performance
    // details about each card. Sibling cards are currently treated as different
    // cards: TODO: allow user to select treating them as the same card.

    function appendC3Div(heading, text, id) {
        var newdiv = d3.select("#reviews").append("div");
        newdiv.append("h4").text(heading);
        newdiv.append('p').text(text);
        newdiv.append('div').attr("id", id);
        // d3.select("#reviews").append('div').attr("id", id);
    }

    appendC3Div("Performance since acquisition", "Number of lapses since \
card learned. Drag to pan, and mouse-weel to zoom.", "scatter-norm-rep-lapse");

    appendC3Div("Performance histogram",
                "Histogram of per-card performance, where ease of 1 is \
failure and all other eases are success.",
                "histogram");

    appendC3Div("Calendar view of acquisition",
                "Time series showing when cards were learned. \
Large circles indicate perfect performance, smaller circles indicate poorer \
performance. Zoomable and pannable.",
                "chart");

    appendC3Div("Scatter plot of lapses versus reps",
                "Lapses and reps are correlated with poor \
performance, so this scatter plot cannot be easily used for analysis.",
                "scatter-rep-lapse");

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
                             "stroke-width": 5
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
                     tick : {rotate : 15,  count: 50, format : '%Y-%m-%d %I:%M'},
                     height : 40,
                 }
               },
        tooltip : {
                    format : {
                        value : function(value, ratio, id) {
                            // value: 1-index!
                            var key = temporalIndexToCardArray[value-1];
                            var str = cardAndConfigToString(revDb[key],
                                                            configModelsFacts);
                            var reps = revDb[key].reps;
                            var lapses = revDb[key].lapses;
                            return str +
                                   " (#" + (value - 1 + 1) + ", " + (reps-lapses) +
                                   '/' + reps + " reps passed)";
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
        point : {
            focus :
                {expand : {enabled : false}}
        }  // don't expand a point on focus
    });

    // Make the radius and opacity of each data circle depend on the pass rate
    var grader =
        function(dbentry) { return 1 - dbentry.lapses / dbentry.reps; };
    var worstRate = grader(_.min(revDb, grader));
    var scaleRadius = d3.scale.linear().domain([ worstRate - .005, 1 ]).range([ 2, 45 ]);
    var scaleOpacity =
        d3.scale.pow().exponent(-17).domain([ worstRate, 1 ]).range([ 1, 0.05 ]);

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
    // High to low, then reverse, to make sure 1.01 and 1 have no roundoff.
    // Include 1.01 to capture 1 in its own bin
    var binDistance = 0.01;
    var histEdges = _.range(1.01, Math.floor(worstRate * 100) / 100,
                            -binDistance).reverse();

    var histData = d3.layout.histogram().bins(histEdges)(_.map(revDb, grader));
    var normalizeHistToPercent = 1 / (temporalIndexToCardArray.length);
    var chartHistData =
        _.map(histData, function(bar) { return [ bar.x, bar.y ]; });
    chartHistData.unshift([ 'x', 'frequency' ]);
    var hist = c3.generate({
        bindto : '#histogram',
        data : {x : 'x', rows : chartHistData, type : "bar"},
        bar : {width : {ratio : .95}},
        axis : {
                 y : {label : {text : "Number of cards"}},
                 x : {
                     label : {text : "Pass rate"},
                     tick : {format : d3.format('.2p')}

                 }
               },
        tooltip : {
                    format : {
                        value : function(value, ratio, id) {
                            return value + ' cards (' +
                                   d3.format('.3p')(value *
                                                    normalizeHistToPercent) +
                                   ' of cards)';
                        }
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
                      var str = cardAndConfigToString(revDb[key],
                                                            configModelsFacts);
                      this.config.tooltip_format_title = function(d) {
                          return "Known for " + d3.round(d) + " days (" + str +
                                 ")";
                      };
                      this.config.tooltip_format_value =
                          function(value, ratio, id) {
                              return d3.round(value) + " (" + str + ")";
                      };
                      var retval =
                          this.getTooltipContent
                              ? this.getTooltipContent(d, [], [], color)
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
    initSqlJs({locateFile: filename => filename}).then(function(localSQL){
        SQL = localSQL;
        readySetup();
    });
});
function readySetup() {
    var options = {};
    var setOptionsImageLoad = function(){
        options.loadImage = $('input#showImage').is(':checked');
        return options;
    }
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
            reader.onload = function(e) { ankiBinaryToTable(e.target.result, setOptionsImageLoad()); };
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
    $("#ankiFile")
        .change({
                  "function" :
                      function(data) {
                          ankiBinaryToTable(data, setOptionsImageLoad());
                      }
                }, eventHandleToTable);
    $("#ankiURLSubmit").click(function(event) {
        ankiURLToTable($("#ankiURL").val(), setOptionsImageLoad(), true);
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
};

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
function core5000Modify(deckNotes, deckFields, deckName) {
    d3.select("body").append("div").attr("id", "core5000");
    d3.select("#core5000").append("h2").text(deckName);
    var divForLink = d3.select("#core5000").append("p");

    //------------------------------------------------------------
    // Variables and functions to help deal with the "Word" column
    //------------------------------------------------------------
    // Parts of speech abbreviations
    var abbreviations =
        "adn.,adv.,aux.,conj.,cp.,i-adj.,interj.,n.,na-adj.,num.,p.,p. \
case,p. conj.,p. disc.,pron.,v.,suffix,prefix".split(',');
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
        // How much hackier can we get :)
        if (0 ==
            seqString.localeCompare(
                "（お）姉さん(o)-nee-san n. elder sister")) {
            // Add space between Japanese and reading
            seqString = "（お）姉さん (o)-nee-san n. elder sister";
        } else if (0 ==
                   seqString.localeCompare(
                       "相変わらず ai-kawara zu adv as ever, as usual, the \
same, as before [always]")) {
            // Add dot to "adv", completing the abbreviation instead of adding
            // another abbreviation which might trigger elsewhere
            seqString =
                "相変わらず ai-kawara zu adv. as ever, as usual, the same, as \
before [always]";
        } else if (0 == seqString.localeCompare("ごと-goto suffix every")) {
            seqString = "ごと goto suffix every";
        } else if (0 == seqString.localeCompare("家 uchi n house, home")) {
            seqString = "家 uchi n. house, home";
        }

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

        if (0==seqString.localeCompare("Oa oobii n. OB (old boy), alumnus")) {
            return {
                pos : pos,
                translation : translation,
                word : "OB",
                romaji : "oobii"
            };
        }
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
        // Again, how much hackier can you get :)
        if (0 == note.Reading.localeCompare("この 単語[たんご]はどういう 意味[いみ]ですか。")) {
            note.Word = "語 go n. word; language";
        }

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
    arrToCSV(deckNotes, deckFields, "Download Nyar's Core5k CSV", divForLink);

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
    if (false) {
        modifiedDeckNotes = _.map(
            _.filter(deckNotes, function(model) {
                return 0 ==
                       "Nayr's Japanese Core5000".localeCompare(model.name);
            }),
            function(model) {
                return core5000Modify(model.notes, model.fieldNames,
                                      model.name);
            });
        if (modifiedDeckNotes.length > 0) {
            return 1;
        }
    }
    return 0;
}

var summer = function(arr) {
    return _.reduce(arr, function(memo, num) { return memo + num; }, 0);
};
var mean = function(arr) { return summer(arr) / arr.length; };
