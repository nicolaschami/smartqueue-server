  import cors from "cors";
  import express from "express";
  import 'dotenv/config';
  import { buildApp } from './app.js';

  const app = buildApp( );

  const start = async () => {
    try {
      
      
      const port = Number(process.env.PORT ?? 3000);
      
      await app.listen({
        port,
        host: '0.0.0.0',
      });

      console.log(`SmartQueue API running on port ${port}`);
    } catch (error) {
      app.log.error(error);
      process.exit(1);
    }
  };

  start();
