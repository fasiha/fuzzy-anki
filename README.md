Fuzzy-Anki
==========
A web-browser-based browser for [Anki](http://ankisrs.net/) decks and review logs.

**What is this?**
This does two things: (1) view decks, and (2) analyze review logs, both in the context of Anki, the spaced-repetition flashcard application.

**Browse deck contents?**
The really valuable thing about Anki is the culture of [deck-sharing](https://ankiweb.net/shared/decks/) grown around it. Currently, the standard way to check out the contents of a deck seems to be to open it in the Anki computer-based application's built-in deck browser, which presents you with a microscope-level view of the contents.

In contrast, this deck browser runs in your web browser. When you visit http://fasiha.github.io/fuzzy-anki/, your browser downloads the entire JavaScript application. You then either point Fuzzy-Anki to an Anki deck available online or "upload" one from your local disk. (Upload is in "quotes" here because the deck isn't being sent to any server on the internet.)

Don't yet have an Anki deck of interest? I'm convinced you will be able to [find](https://ankiweb.net/shared/decks/) several.

**Analyze review logs?**
Anki stores your review performance in a SQLite database. As you can imagine, after months and years, this database becomes very valuable (and we're all glad Anki does cloud-based backup and sync well). While some are happy with Anki's built-in tools for analyzing and visualizing this performance data, it is always nice to have data at your fingertips, ready for your own investigations.

Upload your Anki collections database (usually found in `Documents/Anki/<your name>/collection.anki2`) to convert it to a CSV spreadsheet, ready to import into Excel-like applications or your data analysis software of choice. (Since I prefer Javascript, the data will be available in a global variable, `revlogTable`.)

You can also select decks and view visualizations of your progress. Currently, there are four interactive graphs generated. [See the Wiki for the juicy, colorful details](https://github.com/fasiha/fuzzy-anki/wiki).

**Why, specifically?**
Nayr posted a [community service announcement](http://forum.koohii.com/viewtopic.php?pid=223330) about a shared Anki deck he made called [Nayr's Japanese Core5000](https://ankiweb.net/shared/info/631662071), based on _A Frequency Dictionary of Japanese_ by Yukio Tono, Makoto Yamazaki, and Kikuo Maekawa (2013, names in the Western style), which seemed to be getting some positive buzz on the Koohii forum. Ankiweb showed three facts of the thousand(s) on [its shared page](https://ankiweb.net/shared/info/1269450669) which did indeed seem interesting, but I wanted to view the other entries in a more wholesale and wholesome way than Anki's deck browser or a spreadsheet program. 

For a while, if you uploaded that initial deck, Fuzzy-Anki would recognize it and perform some data processing to enhance its display (see my [Koohii forum post](http://forum.koohii.com/viewtopic.php?pid=223323#p223323) for the sordid details). Now that processing is disabled since those edits have been rolled back into the original deck. The world turns, things come to pass.

As for review logs, Koohii forum-goer yogert909 brought into sharp focus the need for Anki review export and analysis [in this post](http://forum.koohii.com/viewtopic.php?pid=222784#p222784).

**Can I browse any deck that I have on my computer?**
Yes. You can have Anki export one of your decks as an APKG file, which you can upload to Fuzzy-Anki. Since this is entirely a client-side application, you're not uploading your deck to anyone's server, it's all contained on your device.

On the subject of privacy, if you provide Fuzzy-Anki with a URL of an online deck, then whoever is hosting that deck will have a log of your browser downloading it.

**What is Anki?**
It's a major player in the spaced repetition software space. Its defining features may include: written in Python, uses PyQT for GUI and SQLite for databasing, a large user-base and active content and plug-in creation community, cloud backup and sync, and cloud quizzing (but as of now no deck importing).

And for introductions to SRS, see paeans by [Josh Foer](http://www.theguardian.com/education/2012/nov/09/learn-language-in-three-months), [Khatzumoto](http://www.alljapaneseallthetime.com/blog/what-is-an-srs), [Samuel Alexander](http://www.xamuel.com/spaced-repetition-systems/), [Gwern](http://www.gwern.net/Spaced%20repetition), [Sartak](http://sartak.org/2010/01/on-learning.html), [Derek Sivers](http://sivers.org/srs), and a profile of SuperMemo's creator in [Wired](http://archive.wired.com/medtech/health/magazine/16-05/ff_wozniak?currentPage=all).

**Why a client-side JavaScript browser app?**
Browsers have been the best platform for graphical display of information for some years now, at least since the mid-2000s. 

Programmers building custom, stand-alone, native, GUI-based data display applications have to work very hard to make something that they can quickly prototype and that their users can heavily customize. In contrast, with a browser-based application, a programmer can change the software on the server (in this case, one JavaScript file hosted on GitHub.io) for all users to see the new version. And then those users can pop open a [JavaScript console](http://jsforcats.com/) to browse the source code, understand the website's elements, and customize it in ways limited only by their programming-fu.

These users can be much more confident that their browsers will secure them against malicious code than they can of stand-alone applications. And they can expect surprisingly smooth, performant applications thanks to the immense resources web-centered entities like Google, the Mozilla Foundation, Apple, Microsoft have poured into making very efficient web browsers and JavaScript engines.

**Acknowledgements** This application uses
- [D3.js](http://d3js.org), by Mike Bostock and friends, for a mind-bending experience while mapping data to browser elements
- [sql.js](https://github.com/kripken/sql.js), by Alon Zakai and friends, for a JavaScript version of SQLite through Emscripten goodness
- [zlib.js](https://github.com/imaya/zlib.js), by Imaya Yuta and friends, for JavaScript-based ZIP decompression
- [XRegExp](http://xregexp.com/), by Steven Levithan and friends, for Unicode-aware regular expression support in JavaScript (regular expressions: they search text)
- [C3.js](http://c3js.org/), by Masayuki Tanaka and friends, a plot-oriented wrapper to D3.js (what LaTeX is to TeX, what C is to assembly)
- [underscore.js](http://underscorejs.org/), by Jeremy Ashkenas and friends, for functional Javascript candy
- [nice-json2csv](https://github.com/matteofigus/nice-json2csv), by Matteo Figus and friend: what the name says (edited for browser and Excel CSV style)
- [JQuery](http://jquery.com/), for an embarrassingly small amount of things
- [CORS-Anywhere](http://cors-anywhere.herokuapp.com), not a software library but an internet service, allowing your browser to download decks not hosted by GitHub.io

Because of these fine building blocks, Fuzzy-Anki took a handful of hours to throw together. Many, many thanks to their makers, and to the other makers before them who inspired them to make these.

Koohii Forum-goers, especially Vempele, have offered much in the way of beta-testing. Thank you!

**Legal** This software is in the public domain. See LICENSE for the Unlicense.