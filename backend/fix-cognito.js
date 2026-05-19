import 'dotenv/config';
import { CognitoIdentityProviderClient, UpdateUserPoolClientCommand, DescribeUserPoolClientCommand } from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({ region: 'ap-south-1' });

const USER_POOL_ID = 'ap-south-1_4JXzmmOXJ';
const CLIENT_ID = '2uns6tqbka43c64sd2q78k71od';

// First describe to get current settings
const desc = await client.send(new DescribeUserPoolClientCommand({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
}));

console.log('Current callback URLs:', desc.UserPoolClient.CallbackURLs);
console.log('Current logout URLs:', desc.UserPoolClient.LogoutURLs);

// Update with correct URLs
await client.send(new UpdateUserPoolClientCommand({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
  ClientName: desc.UserPoolClient.ClientName,
  CallbackURLs: ['http://localhost:5173/', 'http://localhost:5174/'],
  LogoutURLs: ['http://localhost:5173/', 'http://localhost:5174/'],
  AllowedOAuthFlows: desc.UserPoolClient.AllowedOAuthFlows,
  AllowedOAuthScopes: desc.UserPoolClient.AllowedOAuthScopes,
  AllowedOAuthFlowsUserPoolClient: desc.UserPoolClient.AllowedOAuthFlowsUserPoolClient,
  SupportedIdentityProviders: desc.UserPoolClient.SupportedIdentityProviders,
  ExplicitAuthFlows: desc.UserPoolClient.ExplicitAuthFlows,
}));

console.log('✓ Callback URLs updated to http://localhost:5173/ and http://localhost:5174/');
