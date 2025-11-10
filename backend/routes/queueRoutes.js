const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const sql = require('mssql');
const databaseService = require('../services/databaseService');

// JWT Secret (ในการใช้งานจริงควรเก็บใน environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Login endpoint: Get restaurant config and return JWT token
router.post('/login', async (req, res) => {
  try {
    const { RestID } = req.body;

    if (!RestID) {
      return res.status(400).json({
        error: 'RestID is required'
      });
    }

    console.log(`🔑 Login request for Restaurant ID: ${RestID}`);

    // Get restaurant configuration from Main DB
    const mainPool = await databaseService.initializeMainDb();

    const request = mainPool.request();
    request.input('RestId', require('mssql').VarChar, RestID);

    const configResult = await request.query(`
      SELECT [RestID],
             [RestName],
             [RestServerName],
             [RestDBName],
             [RestUserName],
             [RestPassword]
      FROM [CFS_Gongcha_Main].[dbo].[Tbl_Rest]
      WHERE [RestID] = @RestId
    `);

    if (configResult.recordset.length === 0) {
      return res.status(404).json({
        error: `Restaurant with ID ${RestID} not found`
      });
    }

    const restConfig = configResult.recordset[0];
    console.log(`✅ Found restaurant: ${restConfig.RestName}`);

    // Create JWT payload with restaurant connection details
    const payload = {
      RestID: restConfig.RestID,
      RestName: restConfig.RestName,
      RestServerName: restConfig.RestServerName,
      RestDBName: restConfig.RestDBName,
      RestUserName: restConfig.RestUserName,
      RestPassword: restConfig.RestPassword,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    // Generate JWT token
    const token = jwt.sign(payload, JWT_SECRET);

    console.log(`🎫 JWT token generated for ${restConfig.RestName}`);

    res.json({
      success: true,
      data: {
        token: token,
        restaurantInfo: {
          RestID: restConfig.RestID,
          RestName: restConfig.RestName
        },
        expiresIn: '24h'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({
      error: 'Failed to login',
      message: error.message,
      details: error.stack
    });
  }
});

// Execute with JWT: Decode JWT and execute stored procedure
router.post('/execute-jwt', async (req, res) => {
  try {
    const { token, QueStatus } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'JWT token is required'
      });
    }

    console.log(`🔓 Executing with JWT token...`);

    // Verify and decode JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log(`✅ JWT token verified for restaurant: ${decoded.RestName}`);
    } catch (jwtError) {
      return res.status(401).json({
        error: 'Invalid or expired token',
        message: jwtError.message
      });
    }

    // Extract connection details from JWT payload
    const { RestServerName, RestDBName, RestUserName, RestPassword } = decoded;
    const queStatusValue = QueStatus || 'ALL';

    console.log(`📋 Using connection from JWT: ${RestServerName} -> ${RestDBName} (User: ${RestUserName})`);
    console.log(`📋 QueStatus parameter: ${queStatusValue}`);

    // Parse server and port from RestServerName (format: server,port)
    const parseServerAndPort = (serverString) => {
      console.log(`🔍 Parsing server string: "${serverString}"`);
      const parts = serverString.split(',');
      if (parts.length === 2) {
        const parsed = {
          server: parts[0].trim(),
          port: parseInt(parts[1].trim()) || 1433
        };
        console.log(`✅ Parsed server,port: ${parsed.server}:${parsed.port}`);
        return parsed;
      }
      console.log(`⚠️  No port found, using default: ${serverString.trim()}:1433`);
      return {
        server: serverString.trim(),
        port: 1433
      };
    };

    const serverInfo = parseServerAndPort(RestServerName);
    console.log(`📋 Final connection details: ${serverInfo.server}:${serverInfo.port} -> ${RestDBName}`);

    // Create database configuration
    const dbConfig = {
      server: serverInfo.server,
      port: serverInfo.port,
      database: RestDBName,
      user: RestUserName,
      password: RestPassword,
      options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
        connectionTimeout: 100010,
        requestTimeout: 100010
      }
    };

    console.log(`📞 Connecting to: ${dbConfig.server}:${dbConfig.port} -> ${dbConfig.database}`);

    // Connect to database
    const sql = require('mssql');
    const pool = await sql.connect(dbConfig);

    console.log(`✅ Connected successfully!`);

    // Execute stored procedure [dbo].[Sp_TB_QueOrderStatus] with dynamic QueStatus
    console.log(`📞 Executing: [dbo].[Sp_TB_QueOrderStatus] '${queStatusValue}', 0`);

    const request = pool.request();
    request.input('QueStatus', sql.VarChar(50), queStatusValue);
    request.input('ZoneID', sql.Int, 0);

    const result = await request.execute('[dbo].[Sp_TB_QueOrderStatus]');

    console.log(`✅ Stored procedure returned ${result.recordset?.length || 0} records`);

    // Close connection
    await pool.close();

    const responseData = {
      success: true,
      data: {
        restaurantInfo: {
          RestID: decoded.RestID,
          RestName: decoded.RestName
        },
        connectionInfo: {
          server: serverInfo.server,
          port: serverInfo.port,
          database: RestDBName,
          user: RestUserName
        },
        queueData: result.recordset || [],
        totalRecords: result.recordset?.length || 0,
        storedProcedure: '[dbo].[Sp_TB_QueOrderStatus]',
        parameters: { QueStatus: queStatusValue, ZoneID: 0 }
      },
      timestamp: new Date().toISOString()
    };

    // Broadcast real-time updates via WebSocket to all clients in this restaurant
    const restaurantConnections = req.app.get('restaurantConnections');
    if (restaurantConnections && restaurantConnections.has(decoded.RestID)) {
      const connections = restaurantConnections.get(decoded.RestID);
      const message = JSON.stringify({
        type: 'queueUpdate',
        data: responseData.data
      });

      connections.forEach(ws => {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(message);
        }
      });

      console.log(`📡 Broadcasting queue update to ${connections.size} WebSocket clients for restaurant_${decoded.RestID}`);
    }

    // Return results
    res.json(responseData);

  } catch (error) {
    console.error('Error executing with JWT:', error);
    res.status(500).json({
      error: 'Failed to execute stored procedure',
      message: error.message,
      details: error.stack
    });
  }
});

// Get queue data: /api/queue/:restId
router.get('/:restId', async (req, res) => {
  try {
    const { restId } = req.params;

    if (!restId) {
      return res.status(400).json({
        error: 'Restaurant ID is required'
      });
    }

    console.log(`🚀 Starting queue data flow for Restaurant ID: ${restId}`);

    // Step 1: Get restaurant configuration from Main DB
    console.log(`📞 Step 1: Getting restaurant configuration from Main DB...`);
    await databaseService.initializeMainDb();

    const request = databaseService.mainPool.request();
    request.input('RestId', require('mssql').VarChar, restId);

    const configResult = await request.query(`
      SELECT [RestID],
             [RestName],
             [RestServerName],
             [RestDBName],
             [RestUserName],
             [RestPassword]
      FROM [CFS_Gongcha_Main].[dbo].[Tbl_Rest]
      WHERE [RestID] = @RestId
    `);

    if (configResult.recordset.length === 0) {
      return res.status(404).json({
        error: `Restaurant with ID ${restId} not found`
      });
    }

    const restConfig = configResult.recordset[0];
    console.log(`✅ Step 1 Complete: Found restaurant ${restConfig.RestName}`);
    console.log(`📋 Config retrieved:`, {
      RestID: restConfig.RestID,
      RestName: restConfig.RestName,
      RestServerName: restConfig.RestServerName,
      RestDBName: restConfig.RestDBName,
      RestUserName: restConfig.RestUserName,
      RestPassword: restConfig.RestPassword ? '[PROTECTED]' : 'NULL'
    });

    // Debug: ตรวจสอบข้อมูลก่อนส่งกลับ
    console.log('📤 Sending response with config:', {
      RestID: restConfig.RestID,
      RestName: restConfig.RestName,
      RestServerName: restConfig.RestServerName,
      RestDBName: restConfig.RestDBName,
      RestUserName: restConfig.RestUserName,
      RestPassword: restConfig.RestPassword
    });

    // Return the results with restaurant connection details
    res.json({
      success: true,
      data: {
        restaurantConfig: {
          RestID: restConfig.RestID || null,
          RestName: restConfig.RestName || null,
          RestServerName: restConfig.RestServerName || null,
          RestDBName: restConfig.RestDBName || null,
          RestUserName: restConfig.RestUserName || null,
          RestPassword: restConfig.RestPassword || null
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in queue data flow:', error);
    res.status(500).json({
      error: 'Failed to execute queue data flow',
      message: error.message,
      details: error.stack
    });
  }
});

// Execute stored procedure with connection details from body
router.post('/execute', async (req, res) => {
  try {
    const { RestServerName, RestDBName, RestUserName, RestPassword, QueStatus } = req.body;

    // Validate required fields
    if (!RestServerName || !RestDBName || !RestUserName || !RestPassword) {
      return res.status(400).json({
        error: 'Missing required connection details',
        required: ['RestServerName', 'RestDBName', 'RestUserName', 'RestPassword']
      });
    }

    const queStatusValue = QueStatus || 'ALL';
    console.log(`🚀 Executing stored procedure with provided connection details`);
    console.log(`📋 Connection info: ${RestServerName} -> ${RestDBName} (User: ${RestUserName})`);
    console.log(`📋 QueStatus parameter: ${queStatusValue}`);

    // Parse server and port from RestServerName (format: server,port)
    const parseServerAndPort = (serverString) => {
      console.log(`🔍 Parsing server string: "${serverString}"`);
      const parts = serverString.split(',');
      if (parts.length === 2) {
        const parsed = {
          server: parts[0].trim(),
          port: parseInt(parts[1].trim()) || 1433
        };
        console.log(`✅ Parsed server,port: ${parsed.server}:${parsed.port}`);
        return parsed;
      }
      console.log(`⚠️  No port found, using default: ${serverString.trim()}:1433`);
      return {
        server: serverString.trim(),
        port: 1433
      };
    };

    const serverInfo = parseServerAndPort(RestServerName);
    console.log(`📋 Final connection details: ${serverInfo.server}:${serverInfo.port} -> ${RestDBName}`);

    // Create database configuration
    const dbConfig = {
      server: serverInfo.server,
      port: serverInfo.port,
      database: RestDBName,
      user: RestUserName,
      password: RestPassword,
      options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
        connectionTimeout: 100010,
        requestTimeout: 100010
      }
    };

    console.log(`📞 Connecting to: ${dbConfig.server}:${dbConfig.port} -> ${dbConfig.database}`);

    // Connect to database
    const sql = require('mssql');
    const pool = await sql.connect(dbConfig);

    console.log(`✅ Connected successfully!`);

    // Execute stored procedure [dbo].[Sp_TB_QueOrderStatus] with dynamic QueStatus
    console.log(`📞 Executing: [dbo].[Sp_TB_QueOrderStatus] '${queStatusValue}', 0`);

    const request = pool.request();
    request.input('QueStatus', sql.VarChar(50), queStatusValue);
    request.input('ZoneID', sql.Int, 0);

    const result = await request.execute('[dbo].[Sp_TB_QueOrderStatus]');

    console.log(`✅ Stored procedure returned ${result.recordset?.length || 0} records`);

    // Close connection
    await pool.close();

    // Return results
    res.json({
      success: true,
      data: {
        connectionInfo: {
          server: serverInfo.server,
          port: serverInfo.port,
          database: RestDBName,
          user: RestUserName
        },
        queueData: result.recordset || [],
        totalRecords: result.recordset?.length || 0,
        storedProcedure: '[dbo].[Sp_TB_QueOrderStatus]',
        parameters: { QueStatus: queStatusValue, ZoneID: 0 }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error executing stored procedure:', error);
    res.status(500).json({
      error: 'Failed to execute stored procedure',
      message: error.message,
      details: error.stack
    });
  }
});

// Execute stored procedure [dbo].[Sp_TB_QueOrderStatus_TrnID] with TrnID
router.post('/execute-trnid', async (req, res) => {
  try {
    const { RestServerName, RestDBName, RestUserName, RestPassword, TrnID } = req.body;

    // Validate required fields
    if (!RestServerName || !RestDBName || !RestUserName || !RestPassword || !TrnID) {
      return res.status(400).json({
        error: 'Missing required connection details or TrnID',
        required: ['RestServerName', 'RestDBName', 'RestUserName', 'RestPassword', 'TrnID']
      });
    }

    console.log(`🚀 Executing Sp_TB_QueOrderStatus_TrnID with provided connection details`);
    console.log(`📋 Connection info: ${RestServerName} -> ${RestDBName} (User: ${RestUserName})`);
    console.log(`📋 TrnID: ${TrnID}`);

    // Parse server and port from RestServerName (format: server,port)
    const parseServerAndPort = (serverString) => {
      console.log(`🔍 Parsing server string: "${serverString}"`);
      const parts = serverString.split(',');
      if (parts.length === 2) {
        const parsed = {
          server: parts[0].trim(),
          port: parseInt(parts[1].trim()) || 1433
        };
        console.log(`✅ Parsed server,port: ${parsed.server}:${parsed.port}`);
        return parsed;
      }
      console.log(`⚠️  No port found, using default: ${serverString.trim()}:1433`);
      return {
        server: serverString.trim(),
        port: 1433
      };
    };

    const serverInfo = parseServerAndPort(RestServerName);
    console.log(`📋 Final connection details: ${serverInfo.server}:${serverInfo.port} -> ${RestDBName}`);

    // Create database configuration
    const dbConfig = {
      server: serverInfo.server,
      port: serverInfo.port,
      database: RestDBName,
      user: RestUserName,
      password: RestPassword,
      options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
        connectionTimeout: 100010,
        requestTimeout: 100010
      }
    };

    console.log(`📞 Connecting to: ${dbConfig.server}:${dbConfig.port} -> ${dbConfig.database}`);

    // Connect to database
    const sql = require('mssql');
    const pool = await sql.connect(dbConfig);

    console.log(`✅ Connected successfully!`);

    // Execute stored procedure [dbo].[Sp_TB_QueOrderStatus_TrnID] with @TrnID parameter
    console.log(`📞 Executing: [dbo].[Sp_TB_QueOrderStatus_TrnID] @TrnID='${TrnID}'`);

    const request = pool.request();
    request.input('TrnID', sql.VarChar(50), TrnID);

    const result = await request.execute('[dbo].[Sp_TB_QueOrderStatus_TrnID]');

    console.log(`✅ Stored procedure returned ${result.recordset?.length || 0} records`);

    // Close connection
    await pool.close();

    // Return results
    res.json({
      success: true,
      data: {
        connectionInfo: {
          server: serverInfo.server,
          port: serverInfo.port,
          database: RestDBName,
          user: RestUserName
        },
        queueData: result.recordset || [],
        totalRecords: result.recordset?.length || 0,
        storedProcedure: '[dbo].[Sp_TB_QueOrderStatus_TrnID]',
        parameters: { TrnID: TrnID }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error executing Sp_TB_QueOrderStatus_TrnID:', error);
    res.status(500).json({
      error: 'Failed to execute stored procedure',
      message: error.message,
      details: error.stack
    });
  }
});

// Health check for database connections
router.get('/health', async (req, res) => {
  try {
    await databaseService.initializeMainDb();
    res.json({
      success: true,
      message: 'Database connections are healthy',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Database connection failed',
      message: error.message
    });
  }
});

// Execute KDS stored procedures: /api/queue/execute-kds
router.post('/execute-kds', async (req, res) => {
  try {
    const { token, kdsType } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'JWT token is required'
      });
    }

    if (!kdsType || ![1, 4].includes(parseInt(kdsType))) {
      return res.status(400).json({
        error: 'KDS type is required and must be 1 or 4'
      });
    }

    console.log(`🔓 Executing KDS stored procedure with type: ${kdsType}`);

    // Verify and decode JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log(`✅ JWT token verified for restaurant: ${decoded.RestName}`);
    } catch (jwtError) {
      return res.status(401).json({
        error: 'Invalid or expired token',
        message: jwtError.message
      });
    }

    // Extract connection details from JWT payload
    const { RestServerName, RestDBName, RestUserName, RestPassword } = decoded;

    console.log(`📋 Using connection from JWT: ${RestServerName} -> ${RestDBName} (User: ${RestUserName})`);
    console.log(`📋 KDS Type parameter: ${kdsType}`);

    // Parse server and port from RestServerName (format: server,port)
    const parseServerAndPort = (serverString) => {
      console.log(`🔍 Parsing server string: "${serverString}"`);
      const parts = serverString.split(',');
      if (parts.length === 2) {
        const parsed = {
          server: parts[0].trim(),
          port: parseInt(parts[1].trim()) || 1433
        };
        console.log(`✅ Parsed server,port: ${parsed.server}:${parsed.port}`);
        return parsed;
      } else {
        console.log(`✅ Using default port for server: ${serverString}`);
        return {
          server: serverString.trim(),
          port: 1433
        };
      }
    };

    const serverInfo = parseServerAndPort(RestServerName);
    console.log(`📋 Final connection details: ${serverInfo.server}:${serverInfo.port} -> ${RestDBName}`);

    // Create connection config
    const config = {
      server: serverInfo.server,
      port: serverInfo.port,
      database: RestDBName,
      user: RestUserName,
      password: RestPassword,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
      },
      connectionTimeout: 100010,
      requestTimeout: 100010
    };

    console.log(`📞 Connecting to: ${serverInfo.server}:${serverInfo.port} -> ${RestDBName}`);

    // Connect and execute stored procedure
    const pool = new sql.ConnectionPool(config);
    await pool.connect();
    console.log(`✅ Connected successfully!`);

    // Execute KDS stored procedure
    const request = pool.request();
    const storedProcName = '[dbo].[Sp_TB_OrderKDS]';
    const params = `${kdsType}, 0, 0`;

    console.log(`📞 Executing: ${storedProcName} ${params}`);
    const result = await request.query(`EXEC ${storedProcName} ${kdsType}, 0, 0`);

    console.log(`✅ KDS stored procedure returned ${result.recordset?.length || 0} records`);

    // Close connection
    await pool.close();

    const responseData = {
      success: true,
      data: {
        restaurantInfo: {
          RestID: decoded.RestID,
          RestName: decoded.RestName
        },
        connectionInfo: {
          server: serverInfo.server,
          port: serverInfo.port,
          database: RestDBName,
          user: RestUserName
        },
        kdsData: result.recordset || [],
        totalRecords: result.recordset?.length || 0,
        storedProcedure: '[dbo].[Sp_TB_OrderKDS]',
        parameters: { kdsType: parseInt(kdsType), param2: 0, param3: 0 }
      },
      timestamp: new Date().toISOString()
    };

    // Broadcast real-time updates via WebSocket to all clients in this restaurant
    const restaurantConnections = req.app.get('restaurantConnections');
    if (restaurantConnections && restaurantConnections.has(decoded.RestID)) {
      const connections = restaurantConnections.get(decoded.RestID);
      const message = JSON.stringify({
        type: 'kdsUpdate',
        data: responseData.data
      });

      connections.forEach(ws => {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(message);
        }
      });

      console.log(`📡 Broadcasting KDS update to ${connections.size} WebSocket clients for restaurant_${decoded.RestID}`);
    }

    // Return results
    res.json(responseData);

  } catch (error) {
    console.error('Error executing KDS stored procedure:', error);
    res.status(500).json({
      error: 'Failed to execute KDS stored procedure',
      message: error.message,
      details: error.stack
    });
  }
});

module.exports = router;