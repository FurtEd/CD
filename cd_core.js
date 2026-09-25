// --- GLOBÁLIS VÁLTOZÓK ÉS ADATSZERKEZETEK ---
var enersMap = new Map();
var upperEnerMap = new Map();
var transMap = new Map();
var nbtranfile = 0;
var fileindex = 0;
var nqn = 0;
var nbzerolines = 0;
var filenames = [];

const C_CMpS = 29979245800; 
var segmentsMap = new Map();
var unc_val = 2; // Globális változó az alapértelmezett értékkel

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function transition(freq, unc, upper, lower, ref, comment, filename) {
    this.freq = freq;
    this.unc = unc;
    this.upper = upper;
    this.lower = lower;
    this.ref = ref;
    this.comment = comment;
    this.filename = filename;
}

function upperState(){
    this.trans = [];
    this.unc = [];
    this.lowerstates = [];
    this.lowerEners = [];
    this.refs = [];
    this.avg = 0.0;
    this.sd = 0.0;
    this.predEners = [];
    this.nbWO = 0;
    
    this.addLine = function(freq, unc, lower, lowerE, ref) {
        this.trans.push(freq);
        this.unc.push(unc);
        this.lowerstates.push(lower);
        this.lowerEners.push(lowerE);
        this.refs.push(ref);
    }
    
    this.calcAvg = function() {
        this.avg = 0.0;
        var sumwi = 0.0;
        var sumwixi = 0.0;
        
        if(this.trans.length > 1) {
            for(var i = 0; i < this.trans.length; i++) {
                var predEners = this.trans[i] + this.lowerEners[i];
                this.predEners.push(predEners);
                sumwixi += (predEners * (1.0/this.unc[i]));
                sumwi += (1.0/this.unc[i]);
            }
            this.avg = sumwixi / sumwi;
        } else {
            this.avg = this.trans[0];
            this.predEners.push(this.trans[0]);
        }
    }
    
    this.calcStDev = function() {
        this.sd = 0.0;
        var nosqrt = 0.0;
        if(this.trans.length > 1) {
            for(var i = 0; i < this.trans.length; i++) {
                this.sd += ((this.predEners[i] - this.avg)*(this.predEners[i] - this.avg));
            }
            nosqrt = this.sd/(this.trans.length - 1);
            this.sd = Math.sqrt(nosqrt);
            
            for(var i = 0; i < this.trans.length; i++) {
                if(Math.abs((this.predEners[i] - this.avg)) > 3.0*this.sd)
                    this.nbWO++;
            }
        }
    }
}

// --- ESEMÉNYKEZELŐK ÉS LETÖLTÉS ---
$(document).on('click','#delline',function(){
    var acttran = transMap.get($(this).attr("data"));
    if(acttran.freq > 0.0)
        acttran.freq *= -1.0;
    $(this).remove();
});

function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

$(document).on('click','.downonetrans',function(){
    var fname = $(this).attr("filename");
    var noext = fname.split('.').slice(0, -1).join('.');
    var text = "";
    
    for (var [key, value] of transMap.entries()) {
        if(fname == value.filename)
            text+= value.freq+" "+value.unc+" "+value.upper+" "+value.lower+" "+value.ref+" "+value.comment+"\n";
    }
    
    var d = new Date();
    var filename = noext+"_"+d.getDate() + "_" + (d.getMonth()+1) + "_" + d.getFullYear() + "_" +d.getHours() + "_" + d.getMinutes()+".txt";
    download(filename, text);
});

$(document).on('click','#downtrans',function(){
    var text = "";
    var upplabels, lowlabels;
    for (var [key, value] of transMap.entries()) {
        upplabels = value.upper.replace("&apos;","'");
        lowlabels = value.lower.replace("&apos;","'");
        text+= value.freq+" "+value.unc+" "+upplabels+" "+lowlabels+" "+value.ref+" "+value.comment+"\n";
    }
    
    var d = new Date();
    var filename = "transitions_"+d.getDate() + "_" + (d.getMonth()+1) + "_" + d.getFullYear() + "_" +d.getHours() + "_" + d.getMinutes()+".txt";
    download(filename, text);
});

$(document).on('click','#showdet',function(){
    var label = $(this).attr("data").replace(/'/g,"&apos;");
    var actener = upperEnerMap.get(label);
    var dettext ="";
    var diff = 0.0;
    
    dettext = "<h5>"+$(this).attr("data")+"</h5>";
    dettext += "<strong>AVG. Energy: "+actener.avg.toFixed(6)+"</strong><br/>";
    dettext +="<table class='table table-hover mt-2'>";
    dettext +=" <thead><tr><th>pred Eners</th><th>Diff from avg</th><th>Line</th><th>Delete</th></tr></thead><tbody>";
    for(var i = 0; i < actener.trans.length; i++) {
        diff = actener.predEners[i] - actener.avg;
        dettext +="<tr><td>"+actener.predEners[i].toFixed(6)+"</td><td>"+diff.toFixed(6)+"</td><td>"+actener.refs[i]+"</td><td><button type='button' data='"+actener.refs[i]+"' id='delline' class='btn btn-danger btn-sm'>Delete</button></td></tr>";
    }
    dettext +="</tbody></table>";
    $("#detail").html(dettext);
});

$(document).on('click','#done',function(){
    $(this).parent().parent().remove();
});

// --- NAPLÓZÓ ÉS OLVASÓ FÜGGVÉNYEK ---
function addLog(message, isError = false) {
    var logBox = $("#log-output");
    var time = new Date().toLocaleTimeString();
    var colorClass = isError ? "text-danger fw-bold" : "text-success";
    
    if (logBox.find("em").length > 0) {
        logBox.html("");
    }
    
    logBox.append("<div class='" + colorClass + " mb-1'>[" + time + "] " + message + "</div>");
    logBox.scrollTop(logBox[0].scrollHeight);
}

function ReaderSegFile(file, callback) {
    addLog("Reading segments file: " + file.name + "...");
    var reader = new FileReader();
    
    reader.readAsText(file);
    
    reader.onload = function() {
        var file_str = reader.result;
        var lines = file_str.split(/\r?\n/);
        var hasError = false;
        var loadedCount = 0;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;

            // Láthatatlan/speciális Unicode karakterek tisztítása
            line = line.replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ");
            var tokens = line.trim().split(/\s+/g);

            if (tokens.length < 2) {
                addLog("ERROR in '" + file.name + "' (line " + (i + 1) + "): Invalid row format. Expected reference and unit. Process stopped.", true);
                hasError = true;
                break;
            }

            var refTag = tokens[0].trim();
            var unitTag = tokens[1].trim();

            var allowedUnits = ["cm-1", "MHz", "GHz", "kHz", "Hz", "THz"];
            if (!allowedUnits.includes(unitTag)) {
                addLog("ERROR in '" + file.name + "' (line " + (i + 1) + "): Invalid unit '" + unitTag + "' for reference '" + refTag + "'. Process stopped.", true);
                hasError = true;
                break;
            }

            segmentsMap.set(refTag, unitTag);
            loadedCount++;
        }

        if (hasError) {
            // A hiba már naplózva lett
        } else {
            addLog("Successfully loaded " + loadedCount + " segment references from " + file.name + ".");
            if (callback) callback();
        }
    };

    reader.onerror = function() {
        addLog("Failed to read segments file: " + file.name, true);
    };
}

function convertToCm1(value, unit) {
    switch (unit) {
        case "MHz": return (value * 1e6) / C_CMpS;
        case "GHz": return (value * 1e9) / C_CMpS;
        case "kHz": return (value * 1e3) / C_CMpS;
        case "Hz":  return value / C_CMpS;
        case "THz": return (value * 1e12) / C_CMpS;
        case "cm-1":
        default:
            return value;
    }
}

function ReaderEnerFile(file, callback) {
    addLog("Reading energy file: " + file.name + "...");
    var reader = new FileReader(); 
    reader.readAsText(file);
    reader.onload = function() {  
        var file_str = reader.result;
        var enerArr = file_str.split(/\r?\n/);
        var labelsArr;
        var labels = "";
        var count = 0;
        var hasError = false;
        
        var expectedQnCount = nqn; 
        var expectedTotalCols = expectedQnCount + 3; 

        for (var i = 0; i < enerArr.length; i++) {
            var line = enerArr[i].trim();
            if (!line) continue;
            
            // 1. Láthatatlan/speciális Unicode szóközök cseréje sima szóközre
            line = line.replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ");
            
            // 2. Darabolás bármilyen fehér karakter (szóköz, tabulátor) mentén
            labelsArr = line.trim().split(/\s+/g);
            
            // OSZLOPSZÁM ELLENŐRZÉSE
            if (labelsArr.length !== expectedTotalCols) {
                addLog("ERROR in '" + file.name + "' (line " + (i + 1) + "): Row has " + labelsArr.length + " columns, but expected exactly " + expectedTotalCols + " (NQN = " + nqn + "). Process stopped.", true);
                hasError = true;
                break;
            }

            // ENERGIA ÉRTÉK ÉS TIZEDESPONT ELLENŐRZÉSE
            var energyToken = labelsArr[expectedQnCount];
            var energyVal = parseFloat(energyToken);

            if (isNaN(energyVal) || !energyToken.includes('.')) {
                addLog("ERROR in '" + file.name + "' (line " + (i + 1) + "): Energy value at column " + (expectedQnCount + 1) + " must be a decimal float (found: '" + energyToken + "'). Process stopped.", true);
                hasError = true;
                break;
            }

            // KVANTUMSZMOK ÖSSZEFŰZÉSE
            labels = "";
            for (var j = 0; j < expectedQnCount; j++) {
                labels += labelsArr[j].trim() + " ";
            }
            labels = labels.trim();
            
            enersMap.set(labels, energyVal); 
            count++;
        }

        if (!hasError) {
            addLog("Successfully loaded " + count + " energy levels from " + file.name + ".");
            if (callback) callback();
        }
    };

    reader.onerror = function() {
        addLog("Failed to read energy file: " + file.name, true);
    };
}

function ReaderTranFile(file, callback) {
    var name = file.name;
    filenames.push(name);
    var reader = new FileReader(); 
    reader.readAsText(file);
    reader.onload = function() {  
        var file_str = reader.result;
        var tranArr = file_str.split(/\r?\n/);
        var upplabels = "";
        var lowlabels = "";
        var freq = 0.0;
        var unc = 0.0;
        var ref = "";
        var lowerEnerValue = 0.0;
        var comment = "";
        var hasError = false;

        var startAssign = (unc_val === 1) ? 2 : 3;
        var expectedColumns = (unc_val === 1) ? (2 * nqn + 3) : (2 * nqn + 4);

        for(var i = 0; i < tranArr.length; i++) {
            var line = tranArr[i].trim();
            if(!line || line.includes("&")) continue;
            
            // Rejtett Unicode karakterek tisztítása
            line = line.replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ");
            var labelsArr = line.trim().split(/\s+/g);
            
            if (labelsArr.length !== expectedColumns) {
                addLog("ERROR in '" + name + "' (line " + (i + 1) + "): Row has " + labelsArr.length + " columns, but expected exactly " + expectedColumns + " (NQN = " + nqn + ", UNC = " + unc_val + "). Process stopped.", true);
                hasError = true;
                break;
            }
            
            freq = parseFloat(labelsArr[0]);
            if (!isNumeric(freq) || !labelsArr[0].includes('.')) {
                addLog("ERROR in '" + name + "' (line " + (i + 1) + "): Frequency must be a valid float with decimal point (found: '" + labelsArr[0] + "'). Process stopped.", true);
                hasError = true;
                break;
            }
            
            if (unc_val === 1) {
                unc = parseFloat(labelsArr[1]);
            } else {
                unc = parseFloat(labelsArr[2]);
            }

            if (isNaN(unc) || unc <= 0.0) {
                addLog("ERROR in '" + name + "' (line " + (i + 1) + "): Uncertainty must be a number greater than 0. Process stopped.", true);
                hasError = true;
                break;
            }
            
            upplabels = "";
            for (var j = startAssign; j < (nqn + startAssign); j++) {
                upplabels += labelsArr[j].trim() + " ";
            }
            upplabels = upplabels.trim().replace(/'/g, "&apos;");
            
            lowlabels = "";
            for (var j = (nqn + startAssign); j < (2 * nqn + startAssign); j++) {
                lowlabels += labelsArr[j].trim() + " ";
            }
            lowlabels = lowlabels.trim().replace(/'/g, "&apos;");

            ref = labelsArr[2 * nqn + startAssign];

            if (!ref || ref.trim() === "") {
                addLog("ERROR in '" + name + "' (line " + (i + 1) + "): Missing reference column value. Process stopped.", true);
                hasError = true;
                break;
            }

            var tempRef = ref;
            var offset = tempRef.indexOf(".");
            if (offset !== -1) {
                tempRef = tempRef.substring(0, offset);
            }

            if (segmentsMap.size > 0) {
                if (segmentsMap.has(tempRef)) {
                    var unit = segmentsMap.get(tempRef);
                    freq = convertToCm1(freq, unit);
                    unc = convertToCm1(unc, unit);
                } else {
                    addLog("MISSING REFERENCE ERROR in '" + name + "' (line " + (i + 1) + "): Reference '" + tempRef + "' NOT found in segments file. Process stopped.", true);
                    hasError = true;
                    break;
                }
            }
            
            comment = "";
            if (labelsArr.length > (2 * nqn + startAssign + 1)) {
                for (var j = (2 * nqn + startAssign + 1); j < labelsArr.length; j++)
                    comment += labelsArr[j] + " ";
            }
            
            var tr = new transition(freq, unc, upplabels, lowlabels, ref, comment, name);
            transMap.set(ref, tr);
            
            if (freq > 0.0) {
                if (upperEnerMap.has(upplabels)) {
                    if (enersMap.has(lowlabels)) {
                        lowerEnerValue = enersMap.get(lowlabels);
                        upperEnerMap.get(upplabels).addLine(freq, unc, lowlabels, lowerEnerValue, ref);
                    }
                } else {
                    if (enersMap.has(lowlabels)) {
                        lowerEnerValue = enersMap.get(lowlabels);
                        var upstate = new upperState();
                        upstate.addLine(freq, unc, lowlabels, lowerEnerValue, ref);
                        upperEnerMap.set(upplabels, upstate);
                    }
                }
            }
        }
        
        fileindex++;
        
        if (!hasError) {
            callback();
        }
    };

    reader.onerror = function() {
        addLog("Failed to read transitions file: " + name, true);
    };
}

function checkfiles() {
    addLog("Checking files and calculating energies...");
    
    if (fileindex < nbtranfile) {
        ReaderTranFile($(".multifile:eq(" + fileindex + ")")[0].files[0], checkfiles);
    } else {
        addLog("Upper states found in map: " + upperEnerMap.size);
        
        if (upperEnerMap.size === 0) {
            addLog("WARNING: No matching upper states were found! Check NQN or file format.", true);
            return;
        }

        $("#result").html("");
        
        var table = "<table id='example' class='table table-striped table-hover mt-2 w-100' style='width: 100%;'>";
        table += "<thead><tr><th class='sortable'>Labels ↕</th><th class='sortable'>Avg. Energy ↕</th><th class='sortable'>St. Dev. ↕</th><th class='sortable'>NbTr ↕</th><th>Details</th><th>Done</th></tr></thead>";
        table += "<tbody>";
        
        for (var [key, value] of upperEnerMap) {
            value.calcAvg();
            value.calcStDev();
            table += "<tr><td>" + key + "</td><td>" + value.avg.toFixed(6) + "</td><td>" + value.sd.toFixed(6) + "</td><td>" + value.trans.length + "</td><td><button type='button' data='" + key + "' id='showdet' class='btn btn-primary btn-sm'>Details</button></td><td><button type='button' id='done' class='btn btn-success btn-sm'>Done</button></td></tr>";
        }
        table += "</tbody></table>";
        
        $("#result").append(table);
        $("#result").show();
        
        $("#downfile").html("");
        if (filenames.length > 1) {
            var atext = "<h5 class='h6 mb-2'>Download transitions files one by one:</h5>";
            for (var i = 0; i < filenames.length; i++) {
                atext += "<p class='mb-2'><button type='button' filename='" + filenames[i] + "' class='btn btn-info btn-sm text-white downonetrans'>" + filenames[i] + "</button></p>";
            }
            $("#downfile").append(atext);
        }
        $("#downfile").append("<h5 class='h6 mb-2 mt-3'>Download all transitions in one file:</h5><button type='button' id='downtrans' class='btn btn-info text-white'>Download Transitions</button>");
        
        $(".dontshow").show();
        addLog("Process complete! Results displayed.");
    }
}

// --- FŐ INDÍTÓ GOMB ESEMÉNYKEZELŐ (FRISSÍTETT) ---
$("#runCD").click(function() {
    // 1. ELŐZŐ EREDMÉNYEK ÉS FELÜLETI ELEMEK TELJES TÖRLÉSE
    $("#log-output").html("");
    $("#result").html("").hide();      // Törli és elrejti a korábbi táblázatot
    $("#detail").html("");            // Törli a részletező panelt
    $("#downfile").html("");          // Törli a letöltési gombokat
    $(".dontshow").hide();            // Elrejti az eredmény panelt, amíg az új ki nem számolódik

    addLog("Starting CD Test process...");

    nqn = parseInt($("#quantum").val());
    unc_val = parseInt($("#unc_val").val());

    addLog("Config: NQN = " + nqn + ", UNC = " + unc_val);

    // 2. MEMÓRIÁBAN LÉVŐ MAP-EK ÉS TÖMBÖK TELJES ÜRÍTÉSE
    segmentsMap.clear();
    enersMap.clear();
    upperEnerMap.clear();
    transMap.clear();
    filenames = [];
    fileindex = 0;

    var enerFileInput = $(".ener")[0];
    var segFileInput = $("#segfile")[0];

    if (!enerFileInput || !enerFileInput.files[0]) {
        addLog("Error: No energy file selected!", true);
        return;
    }

    var startTransitions = function() {
        if ($(".multifile:eq(0)")[0] && $(".multifile:eq(0)")[0].files[0]) {
            addLog("Reading transitions file: " + $(".multifile:eq(0)")[0].files[0].name);
            ReaderTranFile($(".multifile:eq(0)")[0].files[0], checkfiles);
        } else {
            addLog("Error: No transitions file selected!", true);
        }
    };

    var startSegments = function() {
        if (segFileInput && segFileInput.files[0]) {
            ReaderSegFile(segFileInput.files[0], startTransitions);
        } else {
            addLog("No segments file selected. Skipping segment conversion.");
            startTransitions();
        }
    };

    ReaderEnerFile(enerFileInput.files[0], startSegments);
});

/* RENDEZÉSI LOGIKA */
$(document).on('click', '#example th.sortable', function() {
    var table = $(this).parents('table').eq(0);
    var rows = table.find('tr:gt(0)').toArray().sort(comparer($(this).index()));
    this.asc = !this.asc;
    if (!this.asc) { rows = rows.reverse(); }
    for (var i = 0; i < rows.length; i++) { table.append(rows[i]); }
});

function comparer(index) {
    return function(a, b) {
        var valA = getCellValue(a, index), valB = getCellValue(b, index);
        return $.isNumeric(valA) && $.isNumeric(valB) ? valA - valB : valA.toString().localeCompare(valB);
    }
}

function getCellValue(row, index) {
    return $(row).children('td').eq(index).text();
}