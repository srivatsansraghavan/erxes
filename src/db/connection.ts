import * as dotenv from 'dotenv';
import { graphql } from 'graphql';
import { makeExecutableSchema } from 'graphql-tools';
import mongoose = require('mongoose');
import resolvers from '../data/resolvers';
import typeDefs from '../data/schema';
import { getEnv } from '../data/utils';
import { debugDb } from '../debuggers';
import { userFactory } from './factories';

dotenv.config();

const NODE_ENV = getEnv({ name: 'NODE_ENV' });
const MONGO_URL = getEnv({ name: 'MONGO_URL', defaultValue: '' });

export const connectionOptions = {
  useNewUrlParser: true,
  useCreateIndex: true,
  autoReconnect: true,
  useFindAndModify: false,
};

mongoose.Promise = global.Promise;

mongoose.connection
  .on('connected', () => {
    if (NODE_ENV !== 'test') {
      debugDb(`Connected to the database: ${MONGO_URL}`);
    }
  })
  .on('disconnected', () => {
    debugDb(`Disconnected from the database: ${MONGO_URL}`);
  })
  .on('error', error => {
    debugDb(`Database connection error: ${MONGO_URL}`, error);
  });

export let connectionInstance;

export const connect = async (URL?: string, options?) => {
  connectionInstance = await mongoose.connect(
    URL || MONGO_URL,
    {
      ...connectionOptions,
      ...(options || { poolSize: 100 }),
    },
  );

  return connectionInstance;
};

export function disconnect() {
  return mongoose.connection.close();
}

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

export const graphqlRequest = async (source: string = '', name: string = '', args?: any, context: any = {}) => {
  const user = await userFactory({});

  const res = {
    cookie: () => {
      return 'cookie';
    },
  };

  const finalContext: any = {};

  finalContext.dataSources = context.dataSources;
  finalContext.user = context.user || user;
  finalContext.res = context.res || res;
  finalContext.commonQuerySelector = {};
  finalContext.userBrandIdsSelector = {};
  finalContext.brandIdSelector = {};
  finalContext.docModifier = doc => doc;

  const rootValue = {};

  const response: any = await graphql(schema, source, rootValue, finalContext, args);

  if (response.errors || !response.data) {
    throw response.errors;
  }

  return response.data[name];
};
