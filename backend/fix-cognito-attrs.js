import 'dotenv/config';
import {
  CognitoIdentityProviderClient,
  UpdateIdentityProviderCommand,
  DescribeIdentityProviderCommand,
  UpdateUserPoolCommand,
  DescribeUserPoolCommand,
  UpdateUserPoolClientCommand,
  DescribeUserPoolClientCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({ region: 'ap-south-1' });
const USER_POOL_ID = 'ap-south-1_4JXzmmOXJ';
const CLIENT_ID = '2uns6tqbka43c64sd2q78k71od';

// 1. Update Google IdP attribute mapping — map Google's email to Cognito email
const idpDesc = await client.send(new DescribeIdentityProviderCommand({
  UserPoolId: USER_POOL_ID,
  ProviderName: 'Google',
}));

console.log('Current Google attribute mappings:', idpDesc.IdentityProvider.AttributeMapping);

await client.send(new UpdateIdentityProviderCommand({
  UserPoolId: USER_POOL_ID,
  ProviderName: 'Google',
  AttributeMapping: {
    email: 'email',
    name: 'name',
    username: 'sub',
  },
}));
console.log('✓ Google attribute mappings updated');

// 2. Make sure email is in the ID token claims via app client read attributes
const clientDesc = await client.send(new DescribeUserPoolClientCommand({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
}));

await client.send(new UpdateUserPoolClientCommand({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
  ClientName: clientDesc.UserPoolClient.ClientName,
  CallbackURLs: clientDesc.UserPoolClient.CallbackURLs,
  LogoutURLs: clientDesc.UserPoolClient.LogoutURLs,
  AllowedOAuthFlows: clientDesc.UserPoolClient.AllowedOAuthFlows,
  AllowedOAuthScopes: clientDesc.UserPoolClient.AllowedOAuthScopes,
  AllowedOAuthFlowsUserPoolClient: clientDesc.UserPoolClient.AllowedOAuthFlowsUserPoolClient,
  SupportedIdentityProviders: clientDesc.UserPoolClient.SupportedIdentityProviders,
  ExplicitAuthFlows: clientDesc.UserPoolClient.ExplicitAuthFlows,
  ReadAttributes: ['email', 'name', 'sub'],
  WriteAttributes: ['email', 'name'],
}));
console.log('✓ App client read attributes updated');
