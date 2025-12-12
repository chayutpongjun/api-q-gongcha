const sql = require('mssql');

// Helper function to parse server and port
const parseServerAndPort = (serverString) => {
  if (!serverString) return { server: null, port: null };
  
  const parts = serverString.split(',');
  if (parts.length === 2) {
    return {
      server: parts[0].trim(),
      port: parseInt(parts[1].trim()) || 1433
    };
  }
  return {
    server: serverString.trim(),
    port: 1433 // Default SQL Server port
  };
};

// Main database configuration
console.log('🔧 Database config from env:', {
  DB_MAIN_SERVER: process.env.DB_MAIN_SERVER,
  DB_MAIN_DATABASE: process.env.DB_MAIN_DATABASE,
  DB_MAIN_USER: process.env.DB_MAIN_USER
});

const mainServerInfo = parseServerAndPort(process.env.DB_MAIN_SERVER);
console.log('🔧 Parsed server info:', mainServerInfo);

const mainDbConfig = {
  server: mainServerInfo.server,
  port: process.env.DB_MAIN_PORT ? parseInt(process.env.DB_MAIN_PORT) : mainServerInfo.port,
  database: process.env.DB_MAIN_DATABASE,
  user: process.env.DB_MAIN_USER,
  password: process.env.DB_MAIN_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectionTimeout: 100000,
    requestTimeout: 100000
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 100000
  }
};

class DatabaseService {
  constructor() {
    this.mainPool = null;
    this.restaurantPools = new Map();
  }

  // Initialize main database connection
  async initializeMainDb() {
    try {
      if (!this.mainPool || !this.mainPool.connected) {
        if (this.mainPool) {
          try {
            await this.mainPool.close();
          } catch (e) {
            // Ignore close errors
          }
        }
        
        console.log('🔄 Reconnecting to main database...');
        this.mainPool = await sql.connect(mainDbConfig);
        console.log('✅ Connected to main database');
      }
      return this.mainPool;
    } catch (error) {
      console.error('❌ Error connecting to main database:', error);
      this.mainPool = null;
      throw error;
    }
  }

  // Get restaurant connection details from main database
  async getRestaurantConfig(restId) {
    try {
      await this.initializeMainDb();
      
      const request = this.mainPool.request();
      request.input('RestId', sql.VarChar, restId);
      
      const result = await request.query(`
        SELECT [RestID],
               [RestName],
               [RestServerName],
               [RestDBName],
               [RestUserName],
               [RestPassword]
        FROM [CFS_DuckieDoze_Main].[dbo].[Tbl_Rest]
        WHERE [RestID] = @RestId
      `);

      if (result.recordset.length === 0) {
        throw new Error(`Restaurant with ID ${restId} not found`);
      }

      return result.recordset[0];
    } catch (error) {
      console.error('❌ Error getting restaurant config:', error);
      throw error;
    }
  }

  // Create restaurant-specific database connection
  async getRestaurantConnection(restConfig) {
    try {
      // Parse server and port from RestServerName (format: server,port or just server)
      const restServerInfo = parseServerAndPort(restConfig.RestServerName);
      const poolKey = `${restServerInfo.server}_${restServerInfo.port}_${restConfig.RestDBName}`;
      
      if (this.restaurantPools.has(poolKey)) {
        return this.restaurantPools.get(poolKey);
      }

      const restaurantDbConfig = {
        server: restServerInfo.server,
        port: restServerInfo.port,
        database: restConfig.RestDBName,
        user: restConfig.RestUserName,
        password: restConfig.RestPassword,
        options: {
          encrypt: true,
          trustServerCertificate: true,
          enableArithAbort: true,
          connectionTimeout: 100000,
          requestTimeout: 100000
        },
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 100000
        }
      };

      console.log(`🔗 Connecting to restaurant database: ${restConfig.RestName} at ${restaurantDbConfig.server}:${restaurantDbConfig.port}`);
      
      const pool = await sql.connect(restaurantDbConfig);
      this.restaurantPools.set(poolKey, pool);
      
      console.log(`✅ Connected to restaurant database: ${restConfig.RestName}`);
      return pool;
    } catch (error) {
      console.error('❌ Error connecting to restaurant database:', error);
      console.error('Connection details:', {
        originalServerName: restConfig.RestServerName,
        parsedServer: parseServerAndPort(restConfig.RestServerName).server,
        parsedPort: parseServerAndPort(restConfig.RestServerName).port,
        database: restConfig.RestDBName
      });
      throw error;
    }
  }

  // Get queue data from restaurant database
  async getQueueData(restId) {
    try {
      // Get restaurant configuration
      const restConfig = await this.getRestaurantConfig(restId);
      
      // Connect to restaurant database
      const restaurantPool = await this.getRestaurantConnection(restConfig);
      
      // Execute stored procedure: exec [dbo].[Sp_TB_QueOrderStatus] 'ALL', 0
      const request = restaurantPool.request();
      
      // Add parameters based on the stored procedure signature
      request.input('QueStatus', sql.VarChar(50), 'ALL');
      request.input('ZoneID', sql.Int, 5);
      
      console.log(`📞 Calling stored procedure: [dbo].[Sp_TB_QueOrderStatus] with database: ${restConfig.RestDBName}`);
      console.log(`📞 Parameters: QueStatus='ALL', ZoneID=0`);
      
      const result = await request.execute('[dbo].[Sp_TB_QueOrderStatus]');
      
      // Debug: Check all result properties
      console.log(`📊 Result object keys:`, Object.keys(result));
      console.log(`📊 Recordset length: ${result.recordset?.length || 0}`);
      console.log(`📊 Recordsets count: ${result.recordsets?.length || 0}`);
      
      // Check if there are multiple recordsets
      if (result.recordsets && result.recordsets.length > 1) {
        console.log(`📊 Multiple recordsets found:`);
        result.recordsets.forEach((rs, index) => {
          console.log(`   Recordset ${index}: ${rs.length} records`);
        });
      }
      
      // Get the first recordset (or combine all if needed)
      let rawData = result.recordset || [];
      
      // If there are multiple recordsets, you might need to combine them or use a specific one
      if (result.recordsets && result.recordsets.length > 0) {
        // Use the largest recordset or combine as needed
        const allRecordsets = result.recordsets;
        const largestRecordset = allRecordsets.reduce((prev, current) => 
          (prev.length > current.length) ? prev : current
        );
        rawData = largestRecordset;
        console.log(`📊 Using recordset with ${rawData.length} records`);
      }
      
      // Debug: Show sample of first few records
      if (rawData.length > 0) {
        console.log(`📊 Sample record structure:`, Object.keys(rawData[0]));
        console.log(`📊 First record:`, rawData[0]);
      }
      
      // Process and organize queue data
      const queueData = this.processQueueData(rawData);
      
      return {
        restaurantInfo: {
          restId: restConfig.RestID,
          restName: restConfig.RestName
        },
        rawData: rawData, // ข้อมูลดิบทั้งหมดจาก stored procedure
        queueData: queueData, // ข้อมูลที่จัดกลุ่มแล้ว
        totalRecords: rawData.length
      };
    } catch (error) {
      console.error('❌ Error getting queue data:', error);
      throw error;
    }
  }

  // Get raw queue data from restaurant database (without processing)
  async getRawQueueData(restId) {
    try {
      // Get restaurant configuration
      const restConfig = await this.getRestaurantConfig(restId);
      
      // Connect to restaurant database
      const restaurantPool = await this.getRestaurantConnection(restConfig);
      
      // Execute stored procedure: exec [dbo].[Sp_TB_QueOrderStatus] 'ALL', 0
      const request = restaurantPool.request();
      
      request.input('QueStatus', sql.VarChar(50), 'ALL');
      request.input('ZoneID', sql.Int, 0);
      
      console.log(`📞 [RAW] Calling stored procedure: [dbo].[Sp_TB_QueOrderStatus] with database: ${restConfig.RestDBName}`);
      console.log(`📞 [RAW] Parameters: QueStatus='ALL', ZoneID=0`);
      
      const result = await request.execute('[dbo].[Sp_TB_QueOrderStatus]');
      
      // Debug raw result
      console.log(`📊 [RAW] Result object keys:`, Object.keys(result));
      console.log(`📊 [RAW] Recordset length: ${result.recordset?.length || 0}`);
      console.log(`📊 [RAW] Recordsets count: ${result.recordsets?.length || 0}`);
      
      let rawData = result.recordset || [];
      
      // Handle multiple recordsets
      if (result.recordsets && result.recordsets.length > 0) {
        console.log(`📊 [RAW] Multiple recordsets detected:`);
        result.recordsets.forEach((rs, index) => {
          console.log(`   [RAW] Recordset ${index}: ${rs.length} records`);
        });
        
        // Use the largest recordset
        const largestRecordset = result.recordsets.reduce((prev, current) => 
          (prev.length > current.length) ? prev : current
        );
        rawData = largestRecordset;
        console.log(`📊 [RAW] Using recordset with ${rawData.length} records`);
      }
      
      return {
        restaurantInfo: {
          restId: restConfig.RestID,
          restName: restConfig.RestName
        },
        data: rawData,
        totalRecords: rawData.length,
        timestamp: new Date().toISOString(),
        debug: {
          recordsetCount: result.recordsets?.length || 1,
          originalRecordsetLength: result.recordset?.length || 0,
          finalDataLength: rawData.length
        }
      };
    } catch (error) {
      console.error('❌ Error getting raw queue data:', error);
      throw error;
    }
  }

  // Process queue data and organize by status
  processQueueData(rawData) {
    const processedData = {
      ready: [],
      preparing: [],
      completed: [],
      cancelled: [],
      all: [], // เพิ่มข้อมูลทั้งหมดโดยไม่กรอง
      summary: {
        total: rawData.length,
        ready: 0,
        preparing: 0,
        completed: 0,
        cancelled: 0,
        other: 0
      }
    };

    // เก็บข้อมูลทั้งหมดโดยไม่กรอง
    const allStatuses = new Set();

    // Group data by QueStatus and sort by QueCreatedatetime
    rawData.forEach((item, index) => {
      const queueItem = {
        trnId: item.TrnID,
        queName: item.QueName,
        tableName: item.tableName,
        zoneId: item.ZoneID,
        zoneName: item.ZoneName,
        queStatus: item.QueStatus,
        queCreatedatetime: item.QueCreatedatetime,
        rawIndex: index, // เพิ่ม index เพื่อ debug
        originalData: item // เก็บข้อมูลดิบทั้งหมด
      };

      // เก็บข้อมูลทั้งหมดไว้
      processedData.all.push(queueItem);
      
      // เก็บ status ทั้งหมดที่พบ
      allStatuses.add(item.QueStatus);

      // จัดกลุ่มตาม QueStatus (ไม่กรองออก)
      const status = item.QueStatus?.toLowerCase();
      switch (status) {
        case 'ready':
          processedData.ready.push(queueItem);
          processedData.summary.ready++;
          break;
        case 'preparing':
          processedData.preparing.push(queueItem);
          processedData.summary.preparing++;
          break;
        case 'completed':
          processedData.completed.push(queueItem);
          processedData.summary.completed++;
          break;
        case 'cancelled':
          processedData.cancelled.push(queueItem);
          processedData.summary.cancelled++;
          break;
        default:
          // ไม่ใส่ใน ready อีกต่อไป แต่นับเป็น other
          console.log(`⚠️  Unknown QueStatus found: "${item.QueStatus}" for TrnID: ${item.TrnID}`);
          processedData.summary.other++;
      }
    });

    // Debug: แสดง status ทั้งหมดที่พบ
    console.log(`📊 All QueStatus found:`, Array.from(allStatuses));
    console.log(`📊 Summary: Ready=${processedData.summary.ready}, Preparing=${processedData.summary.preparing}, Completed=${processedData.summary.completed}, Cancelled=${processedData.summary.cancelled}, Other=${processedData.summary.other}`);

    // Sort each category by QueCreatedatetime (newest first)
    Object.keys(processedData).forEach(key => {
      if (Array.isArray(processedData[key]) && key !== 'summary') {
        processedData[key].sort((a, b) => 
          new Date(b.queCreatedatetime) - new Date(a.queCreatedatetime)
        );
      }
    });

    return processedData;
  }

  // Get queue data using original flow: Main DB -> Restaurant DB -> Stored Procedure
  async getQueueDataOriginalFlow(restId) {
    try {
      console.log(`🔄 Starting original flow for RestID: ${restId}`);
      
      // Step 1: Connect to Main Database and get restaurant configuration
      console.log(`📞 Step 1: Connecting to Main Database...`);
      await this.initializeMainDb();
      
      const request = this.mainPool.request();
      request.input('RestId', sql.VarChar, restId);
      
      const configResult = await request.query(`
        SELECT [RestID],
               [RestName],
               [RestServerName],
               [RestDBName],
               [RestUserName],
               [RestPassword]
        FROM [CFS_DuckieDoze_Main].[dbo].[Tbl_Rest]
        WHERE [RestID] = @RestId
      `);

      if (configResult.recordset.length === 0) {
        throw new Error(`Restaurant with ID ${restId} not found in Main Database`);
      }

      const restConfig = configResult.recordset[0];
      console.log(`✅ Step 1 Complete: Found restaurant config for ${restConfig.RestName}`);
      console.log(`📋 Restaurant Config:`, {
        RestID: restConfig.RestID,
        RestName: restConfig.RestName,
        RestServerName: restConfig.RestServerName,
        RestDBName: restConfig.RestDBName,
        RestUserName: restConfig.RestUserName
      });
      
      // Step 2: Connect to Restaurant Database using the config
      console.log(`📞 Step 2: Connecting to Restaurant Database...`);
      const restaurantPool = await this.getRestaurantConnection(restConfig);
      console.log(`✅ Step 2 Complete: Connected to ${restConfig.RestDBName}`);
      
      // Step 3: Execute stored procedure with parameters 'ALL', 0
      console.log(`📞 Step 3: Executing stored procedure [dbo].[Sp_TB_QueOrderStatus] 'ALL', 0`);
      console.log(`📞 Database: ${restConfig.RestDBName} on ${restConfig.RestServerName}`);
      
      const spRequest = restaurantPool.request();
      spRequest.input('QueStatus', sql.VarChar(50), 'ALL');
      spRequest.input('ZoneID', sql.Int, 0);
      
      const spResult = await spRequest.execute('[dbo].[Sp_TB_QueOrderStatus]');
      
      // Enhanced debugging
      console.log(`📊 Full result object properties:`, Object.keys(spResult));
      console.log(`📊 Recordset length: ${spResult.recordset?.length || 0}`);
      console.log(`📊 Recordsets count: ${spResult.recordsets?.length || 0}`);
      console.log(`📊 Return value: ${spResult.returnValue}`);
      console.log(`📊 Rows affected: ${spResult.rowsAffected}`);
      
      // Check all recordsets if multiple exist
      if (spResult.recordsets && spResult.recordsets.length > 0) {
        console.log(`📊 Multiple recordsets detected:`);
        spResult.recordsets.forEach((rs, index) => {
          console.log(`   Recordset ${index}: ${rs.length} records`);
          if (rs.length > 0) {
            console.log(`   Sample from recordset ${index}:`, rs[0]);
          }
        });
      }
      
      // Debug: Show sample data from main recordset
      if (spResult.recordset && spResult.recordset.length > 0) {
        console.log(`📊 Sample record from main recordset:`, spResult.recordset[0]);
        console.log(`📊 Record structure:`, Object.keys(spResult.recordset[0]));
        
        // Show first 3 records for comparison
        console.log(`📊 First 3 records:`, spResult.recordset.slice(0, 3));
      }
      
      // Try alternative data extraction
      let finalData = spResult.recordset || [];
      
      // If recordset is empty but recordsets exist, use the largest one
      if ((!finalData || finalData.length === 0) && spResult.recordsets && spResult.recordsets.length > 0) {
        const largestRecordset = spResult.recordsets.reduce((prev, current) => 
          (prev.length > current.length) ? prev : current
        );
        finalData = largestRecordset;
        console.log(`📊 Using alternative recordset with ${finalData.length} records`);
      }
      
      console.log(`✅ Step 3 Complete: Final data has ${finalData.length} records`);
      
      return {
        success: true,
        restaurantConfig: {
          RestID: restConfig.RestID,
          RestName: restConfig.RestName,
          RestServerName: restConfig.RestServerName,
          RestDBName: restConfig.RestDBName,
          RestUserName: restConfig.RestUserName
        },
        queueData: finalData,
        totalRecords: finalData.length,
        debugInfo: {
          originalRecordsetLength: spResult.recordset?.length || 0,
          recordsetsCount: spResult.recordsets?.length || 0,
          finalDataLength: finalData.length,
          returnValue: spResult.returnValue,
          rowsAffected: spResult.rowsAffected
        },
        executionFlow: {
          step1: 'Main DB connection - SUCCESS',
          step2: 'Restaurant DB connection - SUCCESS', 
          step3: 'Stored procedure execution - SUCCESS',
          storedProcedure: '[dbo].[Sp_TB_QueOrderStatus]',
          parameters: { QueStatus: 'ALL', ZoneID: 0 }
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error in original flow:', error);
      throw error;
    }
  }

  // Test method to check basic table data
  async testTableData(restId) {
    try {
      console.log(`🔍 Testing table data for RestID: ${restId}`);
      
      // Get restaurant config
      const restConfig = await this.getRestaurantConfig(restId);
      const restaurantPool = await this.getRestaurantConnection(restConfig);
      
      // Test queries
      const tests = [
        {
          name: 'Count Tbl_TableOrderStatus',
          query: 'SELECT COUNT(*) as total_count FROM [dbo].[Tbl_TableOrderStatus]'
        },
        {
          name: 'Count with TrnID not null',
          query: 'SELECT COUNT(*) as count_with_trnid FROM [dbo].[Tbl_TableOrderStatus] WHERE TrnID IS NOT NULL'
        },
        {
          name: 'Sample Tbl_TableOrderStatus records',
          query: 'SELECT TOP 5 * FROM [dbo].[Tbl_TableOrderStatus] WHERE TrnID IS NOT NULL ORDER BY TrnID'
        },
        {
          name: 'Count tbl_table',
          query: 'SELECT COUNT(*) as table_count FROM dbo.tbl_table'
        },
        {
          name: 'Count tbl_Zone',
          query: 'SELECT COUNT(*) as zone_count FROM dbo.tbl_Zone'
        },
        {
          name: 'Direct stored procedure test',
          query: 'EXEC [dbo].[Sp_TB_QueOrderStatus] @QueStatus = \'ALL\', @ZoneID = 0'
        }
      ];
      
      const results = {};
      
      for (const test of tests) {
        try {
          console.log(`🧪 Running test: ${test.name}`);
          const result = await restaurantPool.request().query(test.query);
          results[test.name] = {
            success: true,
            recordCount: result.recordset?.length || 0,
            data: result.recordset
          };
          console.log(`✅ ${test.name}: ${result.recordset?.length || 0} records`);
        } catch (error) {
          console.log(`❌ ${test.name}: ${error.message}`);
          results[test.name] = {
            success: false,
            error: error.message
          };
        }
      }
      
      return {
        restaurantConfig: {
          RestID: restConfig.RestID,
          RestName: restConfig.RestName,
          RestDBName: restConfig.RestDBName
        },
        testResults: results,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error in table data test:', error);
      throw error;
    }
  }

  // Close all connections
  async closeConnections() {
    try {
      if (this.mainPool) {
        await this.mainPool.close();
        this.mainPool = null;
      }
      
      for (const [key, pool] of this.restaurantPools) {
        await pool.close();
      }
      this.restaurantPools.clear();
      
      console.log('✅ All database connections closed');
    } catch (error) {
      console.error('❌ Error closing database connections:', error);
    }
  }
}

module.exports = new DatabaseService();