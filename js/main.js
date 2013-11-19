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

function genTableInfo(table)
{
    var tableInfo = [];
    for(attr in table[0]){
        tableInfo[attr] = distinctVals(table, attr);
    }
    return tableInfo;
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
    var entropy = 0;
    for(val in distinct){
        if (distinct[val] > maxFrequency){
            maxFrequency = distinct[val];
            maxVal = val;
        }
        entropy -= (distinct[val]/table.length) * Math.log(distinct[val]/table.length)/Math.log(2);
    }
    return {val: maxVal, prob: maxFrequency/table.length, entropy: entropy, norm: Object.keys(distinct).length};
}



function gTree(node, table, tableInfo, label_column, default_label)
{
    var ret = {leaves:0, entropy:0};
    if(table.length < 1){

        node.isLeaf = true;

        node.attribute = default_label.val;
        node.chance = default_label.prob;

        //console.log("EMPTY: "+node.label+"->"+node.attribute);
        return {leaves: default_label.norm, entropy: default_label.entropy};
    }
    else if(Object.keys(table[0]).length == 1){

        node.isLeaf = true;

        node.attribute = default_label.val;
        node.chance = default_label.prob;

        //console.log("SINGLE: "+node.label+"->"+node.attribute);
        return {leaves:default_label.norm, entropy: default_label.entropy};
    }
    else if(isHomo(table, label_column)){

        node.isLeaf = true;
        node.attribute = table[0][label_column];

        return {leaves: 1, entropy: 0};        
    }
    else
    {
        var split = decideSplitting(table, label_column);
        node.attribute = split;

        for(k in tableInfo[split]){
            var newnode = new Node();

            newnode.label = k;
            node.children.push(newnode);

            var p_default_label = frequentVal(table, label_column);
            var p_table = getPruned(table, split, k);
            var res = gTree(newnode, p_table, tableInfo, label_column, p_default_label);

            console.log(ret.entropy + " | "+res.entropy);
            ret.entropy += res.entropy;
            ret.leaves += res.leaves;
        }            
    }
    return ret;
}


