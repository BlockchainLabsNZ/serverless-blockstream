import { BlockStreamState } from '../model';
import logger from '../logger';
import { BLOCKSTREAM_STATE_TABLE, NETWORK_ID } from '../env';
import { DynamoDB } from 'aws-sdk';
import { BlockWithTransactionHashes } from '../../client/model';
import BigNumber from 'bignumber.js';

const ddbClient = new DynamoDB.DocumentClient();

export async function getBlockStreamState(): Promise<BlockStreamState | null> {
  try {
    const { Item } = await ddbClient.get({
      TableName: BLOCKSTREAM_STATE_TABLE,
      Key: {
        network_id: NETWORK_ID
      },
      ConsistentRead: true
    }).promise();

    if (!Item || Item.network_id !== NETWORK_ID) {
      return null;
    }

    return Item as BlockStreamState;
  } catch (err) {
    logger.error({ err }, 'failed to fetch blockstream state');
    throw err;
  }
}

export async function saveBlockStreamState(prevState: BlockStreamState | null, reconciledBlock: BlockWithTransactionHashes): Promise<void> {
  // build the input parameters
  let input: DynamoDB.DocumentClient.PutItemInput = {
    TableName: BLOCKSTREAM_STATE_TABLE,
    Item: {
      network_id: NETWORK_ID,
      blockHash: reconciledBlock.hash,
      blockNumber: (new BigNumber(reconciledBlock.number)).valueOf(),
      timestamp: (new Date()).getTime()
    }
  };

  // add conditions to the expression if there's a previous state
  if (prevState !== null) {
    input = {
      ...input,
      ConditionExpression: '#network_id = :network_id AND #blockHash = :blockHash AND #blockNumber = :blockNumber',
      ExpressionAttributeNames: {
        '#network_id': 'network_id',
        '#blockHash': 'blockHash',
        '#blockNumber': 'blockNumber'
      },
      ExpressionAttributeValues: {
        ':network_id': prevState.network_id,
        ':blockHash': prevState.blockHash,
        ':blockNumber': prevState.blockNumber
      }
    };
  }

  try {
    logger.debug({ input }, 'saving blockstream state');

    await ddbClient.put(input).promise();
  } catch (err) {
    logger.error({ err, input }, 'failed to save blockstream state');

    throw err;
  }
}
