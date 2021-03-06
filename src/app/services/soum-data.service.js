const cartodb = require('cartodb');

/** @ngInject */
export function SoumData($log, $http, $q, Config, NationalConfig, _) {
  return {
    geojson,
    load,
    compare
  };

  function geojson(soumId) {
    // Given a soumId return the geojson boundary for it
    // Wrap in angular promise so we're consistent with the types of promises we're
    //  using in public APIs
    const dfd = $q.defer();
    const sql = new cartodb.SQL({user: Config.carto.accountName});
    sql.execute("SELECT the_geom FROM soums WHERE soumcode = {{soumcode}}", {
      soumcode: soumId
    }, {
      format: 'geojson'
    }).done(data => dfd.resolve(data)).error(error => dfd.reject(error));
    return dfd.promise;
  }

  function load(soumId, mapSections) {
    // mapSections is the relevant mapSections key of a PageConfig object to load data for
    // Return a promise that resolves with the constructed soum
    return loadSoumData(soumId, mapSections).then(responses => {
      // Pass all response objects to merge them together as one row
      const combinedRow = mergeResponses(responses);
      // Format the combined result with the same structure as Config
      const soum = formatSoumData(combinedRow, mapSections);
      // Done!
      return soum;
    });
  }

  function compare(soumId, columns) {
    // Given a soumId return the geojson boundary for it
    // Wrap in angular promise so we're consistent with the types of promises we're
    //  using in public APIs
    const dfd = $q.defer();
    const sql = new cartodb.SQL({user: Config.carto.accountName});
    const query = ["SELECT soums.soumcode, {{columns}},",
                   "(EXISTS (",
                     "SELECT 1 FROM clusters",
                     "JOIN soums AS target",
                       "ON ST_Intersects(target.the_geom, clusters.the_geom)",
                     "WHERE ST_Intersects(soums.the_geom, clusters.the_geom)",
                       "AND target.soumcode={{soumId}})",
                   ") AS neighbor",
                   "FROM soums"].join(' ');
    sql.execute(query, {soumId, columns})
      .done(data => dfd.resolve(data))
      .error(error => dfd.reject(error));
    return dfd.promise.then(data => _parseCompare(data, soumId, columns));
  }

  function _parseCompare(data, soumId, columns) {
    const rows = data.rows;
    const soumRow = _.find(rows, {soumcode: soumId});

    const comparison = {
      country: {},
      cluster: {},
      soum: soumRow
    };

    for (const column of columns) {
      const colData = _.map(rows, column);
      const clusterRows = _.filter(rows, {neighbor: true});
      const clusterData = _.map(clusterRows, column);

      comparison.country[column] = colData.reduce((sum, val) => sum + val, 0) / colData.length;
      comparison.cluster[column] = clusterData.reduce((sum, val) => sum + val, 0) / clusterData.length;
    }
    return {rows, comparison};
  }

  function mergeResponses(responses) {
    // Take several CartoSQL responses (Assuming a single row each) and return
    //  an object with the combined columns from each. Repeated column names
    //  are overwritten.
    const result = {};
    for (const response of responses) {
      const row = response.data.rows[0];
      for (const key of Object.keys(row)) {
        result[key] = row[key];
      }
    }
    return result;
  }

  function formatSoumData(soumRow, mapSections) {
    // Take a key->value row from CartoSQL and format it the same way as NationalConfig
    const soum = {};
    for (const label of Object.keys(mapSections)) {
      const section = mapSections[label];
      soum[label] = processSection(soumRow, section, 'visualizations');
    }
    soum.metadata = processSection(soumRow, NationalConfig.metadata, 'fields');

    return soum;
  }

  function processSection(soumRow, section, container) {
    // Process through a section of the NationalConfig definitions and add values from
    //  CartoSQL to each field.
    const results = {};
    for (const variable of section[container]) {
      // Attach this Soum's value to the column object
      variable.value = soumRow[variable.field];
      const id = variable.key || variable.field;
      results[id] = variable;
    }
    return results;
  }

  function getAllFields(mapSections) {
    // Parse through the config to build a mapping of {table: [field...]} for all
    //  columns referenced.
    const fields = {};
    for (const label of Object.keys(mapSections)) {
      loadSectionFields(fields, mapSections[label], 'visualizations');
    }
    loadSectionFields(fields, NationalConfig.metadata, 'fields');
    return fields;
  }

  function loadSectionFields(fields, section, container) {
    for (const variable of section[container]) {
      const table = variable.table || section.table;
      if (!fields[table]) {
        fields[table] = [];
      }
      fields[table].push(variable.field);
    }
  }

  function loadSoumData(soumId, mapSections) {
    // Given a Soum ID, use CartoSQL to load all data referenced in the NationalConfig
    //  for that Soum.
    const fieldList = getAllFields(mapSections);
    const promises = [];

    for (const table of Object.keys(fieldList)) {
      const fields = fieldList[table];
      const query = `SELECT ${fields} FROM ${table} WHERE soumcode = ${soumId}`;

      const request = {
        method: 'GET',
        url: `https://${Config.carto.accountName}.carto.com/api/v2/sql?q=${query}`
      };

      promises.push($http(request));
    }

    return $q.all(promises);
  }
}
