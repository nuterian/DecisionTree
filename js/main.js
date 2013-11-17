function CSVToArray( strData, strDelimiter ){
	// Check to see if the delimiter is defined. If not,
	// then default to comma.
	strDelimiter = (strDelimiter || ",");

	// Create a regular expression to parse the CSV values.
	var objPattern = new RegExp(
		(
			// Delimiters.
			"(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +

			// Quoted fields.
			"(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +

			// Standard fields.
			"([^\"\\" + strDelimiter + "\\r\\n]*))"
		),
		"gi"
		);


	// Create an array to hold our data. Give the array
	// a default empty first row.
	var arrData = [[]];

	// Create an array to hold our individual pattern
	// matching groups.
	var arrMatches = null;


	// Keep looping over the regular expression matches
	// until we can no longer find a match.
	while (arrMatches = objPattern.exec( strData )){

		// Get the delimiter that was found.
		var strMatchedDelimiter = arrMatches[ 1 ];

		// Check to see if the given delimiter has a length
		// (is not the start of string) and if it matches
		// field delimiter. If id does not, then we know
		// that this delimiter is a row delimiter.
		if (
			strMatchedDelimiter.length &&
			(strMatchedDelimiter != strDelimiter)
			){

			// Since we have reached a new row of data,
			// add an empty row to our data array.
			arrData.push( [] );

		}


		// Now that we have our delimiter out of the way,
		// let's check to see which kind of value we
		// captured (quoted or unquoted).
		if (arrMatches[ 2 ]){

			// We found a quoted value. When we capture
			// this value, unescape any double quotes.
			var strMatchedValue = arrMatches[ 2 ].replace(
				new RegExp( "\"\"", "g" ),
				"\""
				);

		} else {

			// We found a non-quoted value.
			var strMatchedValue = arrMatches[ 3 ];

		}


		// Now that we have our value string, let's add
		// it to the data array.
		arrData[ arrData.length - 1 ].push( strMatchedValue );
	}

	// Return the parsed data.
	return( arrData );
}

function Node(){
    this.label = "";
    this.attribute = "";
    this.isLeaf = false;
    this.chance = 1;
    this.children = []
}


function genTable(arr)
{
    var table = [];
    for(var i=1; i<arr.length; i++){
        var row = {};
        for(var j=0; j<arr[0].length; j++){
            row[arr[0][j]] = arr[i][j];
        }
        table.push(row);
    }
    return table;
}

function distinctVals(table, column)
{
    var distinct = {};
    for(var i=0; i<table.length; i++){
        if(table[i][column] in distinct)
            distinct[table[i][column]]++;
        else
            distinct[table[i][column]] = 1;
    }
    return distinct;
}

function getPruned(table, column, value)
{
    var pruned = [];
    var _table = jQuery.extend(true, {}, table);

    for(var i=0; i<table.length; i++){
        if(table[i][column] == value){
            delete _table[i][column];
            pruned.push(_table[i]);
        }
    }
    return pruned;    
} 

function decideSplitting(table, label_column)
{
    var minEntropy = 999;
    var minEntropyColumn = "";

    for (column in table[0]){
        if (column == label_column) continue;

        var distinct_attrs = distinctVals(table, column);
        var col_entropy = 0;

        for(attr in distinct_attrs){
            var pruned = getPruned(table, column, attr);
            var distinct_labels = distinctVals(pruned, label_column);

            var attr_entropy = 0;
            for(label in distinct_labels){
                var p = distinct_labels[label]/pruned.length;
                attr_entropy -= (p * (Math.log(p)/Math.log(2)));
            }
            col_entropy += attr_entropy * distinct_attrs[attr];
        }

        col_entropy /= table.length;

        if(col_entropy < minEntropy){
            minEntropy = col_entropy;
            minEntropyColumn = column;
        }
    }

    return minEntropyColumn;   
}

function isHomo(table, label_column)
{
    var firstVal = table[0][label_column];
    for(var i=1; i<table.length; i++){
        if(firstVal != table[i][label_column])
            return false;
    }
    return true;
}

function frequentVal(table, column)
{
    var distinct = distinctVals(table, column);
    var maxFrequency = -1;
    var maxVal = "";
    for(val in distinct){
        if (distinct[val] > maxFrequency){
            maxFrequency = distinct[val];
            maxVal = val;
        }
    }
    return {val: maxVal, prob: maxFrequency/table.length};
}

function genTree(node, table, label_column)
{
    var ret = {leaves:0, entropy:0};

    if(Object.keys(table[0]).length == 1){
        node.isLeaf = true;

        var freq_val = frequentVal(table, label_column);
        node.attribute = freq_val.val;
        node.chance = freq_val.prob;

        return {leaves:1, entropy: (node.chance * (Math.log(node.chance)/Math.log(2)))};
    }
    else if(isHomo(table, label_column)){
        node.isLeaf = true;
        node.attribute = table[0][label_column];
        return {leaves: 1, entropy: 0};
    }
    else
    {
        var split = decideSplitting(table, label_column);
        //console.log("LAB:"+label_column+"SPLIT: "+split);
        node.attribute = split;

        var distinct = distinctVals(table, split);
        for(k in distinct){
            var newnode = new Node();
            newnode.label = k;
            node.children.push(newnode);

            var p_table = getPruned(table, split, k);
            var res = genTree(newnode, p_table, label_column);
            ret.entropy -= res.entropy;
            ret.leaves += res.leaves;
        }            
    }
    return ret;
}


/*
$("#parseButton").click(function(){
    var arr = CSVToArray($("#trainInput").val(), ",");
    //console.log(arr);
    var table = genTable(arr);
    console.log(table);

    var root = new Node();
    root = genTree(root, table, "restaurant");


    console.log(JSON.stringify(root));
});
*/


$(function(){
    $trainDataContainer = $("#trainDataContainer");
    $trainInput = $("#trainInput");
    $trainNameInput = $("#trainNameInput");
    $trainTable = $("#trainingDataTable > tbody");
    $treeEntropyTable = $("#treeEntropyTable");

    _curTable = [];
    _curTrees = {};
    
    function listSets(){
        $trainTable.html('');
        var sets = JSON.parse(localStorage['DTClass.sets']);
        for(var i=0; i<sets.length; i++){
            $trainTable.append('<tr data="'+i+'"><td class="title">'+sets[i].name+'</td><td>'+sets[i].modified+'<td class="actions"></td></tr>');
        }        
    }

    function loadTrainSet(id)
    {
        if($trainDataContainer.is(':hidden')) $trainDataContainer.show();
        $("#treeEntropyContainer").hide();
        $("#testInputContainer").hide();

        var sets = JSON.parse(localStorage['DTClass.sets']);
        $trainInput.val(sets[id].raw_train);
        $trainDataContainer.attr("data", id);
        $trainNameInput.val(sets[id].name);
    }

    $("#createButton").click(function(){
        $trainDataContainer.show();
        $trainInput.val('');
        $("#treeEntropyContainer").hide();
        $("#testInputContainer").hide();
    });

    $("#saveButton").click(function(){
        var d = new Date();
        var set = {
            name: $trainNameInput.val(),
            raw_train: $trainInput.val(),
            modified: d.toLocaleDateString() + " " + d.toLocaleTimeString()
        };
        var sets = JSON.parse(localStorage['DTClass.sets']);
        var id = $trainDataContainer.attr("data");
        if(id == ""){
            $trainDataContainer.attr("data", sets.length);
            sets.push(set);
        }
        else
            sets[id] = set;

        localStorage['DTClass.sets'] = JSON.stringify(sets);

        listSets();
    });

    function showTreeEfficiencies()
    {
        $("#treeEntropyContainer").show();
        $treeEntropyTable.html('');
        $treeEntropyTable.append("<thead><tr></tr></thead>");
        $treeEntropyTable.append("<tbody><tr></tr></tbody>");
        
        for(attrib in _curTrees){
            //console.log(attrib);
            $treeEntropyTable.find("thead tr").append("<th>"+attrib+"</th>");
            $treeEntropyTable.find("tbody tr").append("<td>"+((1-_curTrees[attrib].efficiency)*100).toFixed(2)+"%</td>");
        }
    }

    $("#parseButton").click(function(){

        var arr = CSVToArray($trainInput.val(), $("#parseDelInput").val());
        _curTable = genTable(arr);

        _curTrees = {};
        for(attrib in _curTable[0]){
            var root = new Node();
            var tree = genTree(root, _curTable, attrib);
            _curTrees[attrib] = {root: root, efficiency: tree.entropy/(Math.log(tree.leaves)/Math.log(2))};
        }
        showTreeEfficiencies();
        $("#testInputContainer").show();
        //console.log(_curTrees);
    });

    function getLabel(node, test)
    {
        if(node.isLeaf){return {label:node.attribute, chance: node.chance};}

        for(var i=0; i<node.children.length; i++){
            if(test[node.attribute] == node.children[i].label){
                return getLabel(node.children[i], test);
                break;
            }
        }
    }

    function predictLabel(arr)
    {
        var test = {}, i=0, predAttr = "", f=0;
        for(attr in _curTable[0]){
            test[attr] = arr[i++];
            if(test[attr] == ""){
                if (f == 1) return null;
                predAttr = attr;
                f=1;
            }
        }
        console.log(arr);
        if (predAttr == "") return null;

        console.log(JSON.stringify(_curTrees[predAttr].root));
        return { attrib: predAttr, label: getLabel(_curTrees[predAttr].root, test) };
    }

    $("#testButton").click(function(){
        if($("#testInput").val() == "") return;
        var arr = CSVToArray($("#testInput").val(), ",");
        arr = arr[0];
        var label = predictLabel(arr);

        if(label == null) return;
        $("#testResult").html("<strong>"+label.attrib+":</strong> "+label.label.label+"<span class='light'> with "+(label.label.chance*100).toFixed(2)+"% chance</span>");
    });

    $trainTable.on("click", "tr", function(e){
        console.log(e.currentTarget);
        loadTrainSet($(e.currentTarget).attr("data"));
    });

    if (!("DTClass.sets" in localStorage) || localStorage['DTClass.sets'] == "[]"){
        localStorage["DTClass.sets"] = JSON.stringify([]);
        $trainTable.html('<td colspan="3" style="text-align:center; padding:30px 0">No Training sets found. Click the button above to create one.</td>');
    }
    else{
        listSets();
    }
});
