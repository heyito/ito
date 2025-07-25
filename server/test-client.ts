import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-node'
import {
  ItoService,
  CreateNoteRequestSchema,
  GetNoteRequestSchema,
  ListNotesRequestSchema,
  UpdateNoteRequestSchema,
  DeleteNoteRequestSchema,
  CreateInteractionRequestSchema,
  GetInteractionRequestSchema,
  ListInteractionsRequestSchema,
  UpdateInteractionRequestSchema,
  DeleteInteractionRequestSchema,
  CreateDictionaryItemRequestSchema,
  ListDictionaryItemsRequestSchema,
  UpdateDictionaryItemRequestSchema,
  DeleteDictionaryItemRequestSchema,
} from './src/generated/ito_pb.js'
import { create } from '@bufbuild/protobuf'
import { v4 as uuidv4 } from 'uuid'

// Mock JWT token for testing (replace with actual Auth0 token)
const TEST_JWT_TOKEN = process.env.TEST_JWT_TOKEN || 'your-jwt-token-here'

const transport = createConnectTransport({
  baseUrl: 'http://localhost:3000',
  httpVersion: '1.1', // Use HTTP/1.1 to match the server
})

const client = createClient(ItoService, transport)

// Create headers with Auth0 JWT token
const createAuthHeaders = (token: string) => {
  return { authorization: `Bearer ${token}` }
}

// Test the Notes API with authentication
async function testNotesApi() {
  console.log('\n📝 Testing Notes API...')

  const headers = createAuthHeaders(TEST_JWT_TOKEN)
  const testUserId = 'test-user-id-123' // A dummy user id for testing

  // 1. Create a note
  console.log('  - Creating a new note...')
  const createRequest = create(CreateNoteRequestSchema, {
    id: uuidv4(),
    content: 'This is a test note from the client.',
  })
  const createdNote = await client.createNote(createRequest, { headers })
  console.log('  ✓ Note created successfully')

  const noteId = createdNote.id

  // 2. List notes for the user
  console.log(`  - Listing notes for user ${testUserId}...`)
  const listRequest = create(ListNotesRequestSchema, {})
  const listResponse = await client.listNotes(listRequest, { headers })
  console.log(`  ✓ Found ${listResponse.notes.length} notes.`)
  if (!listResponse.notes.some(note => note.id === noteId)) {
    throw new Error('Newly created note not found in list!')
  }
  console.log('  ✓ Newly created note is present in the list.')

  // 3. Get the specific note
  console.log(`  - Getting note by ID ${noteId}...`)
  const getRequest = create(GetNoteRequestSchema, { id: noteId })
  const fetchedNote = await client.getNote(getRequest, { headers })
  console.log('  ✓ Fetched note successfully.')
  if (fetchedNote.content !== 'This is a test note from the client.') {
    throw new Error('Fetched note content does not match created content!')
  }

  // 4. Update the note
  console.log(`  - Updating note ID ${noteId}...`)
  const updateRequest = create(UpdateNoteRequestSchema, {
    id: noteId,
    content: 'This is the updated note content.',
  })
  const updatedNote = await client.updateNote(updateRequest, { headers })
  console.log('  ✓ Updated note successfully.')
  if (updatedNote.content !== 'This is the updated note content.') {
    throw new Error('Note content was not updated correctly!')
  }

  // 5. Delete the note
  console.log('  - Deleting note ID ' + noteId + '...')
  const deleteRequest = create(DeleteNoteRequestSchema, { id: noteId })
  await client.deleteNote(deleteRequest, { headers })
  console.log('  ✓ Delete request sent successfully.')

  // 6. Verify the note is now marked as deleted
  console.log(`  - Verifying note is marked as deleted in the list...`)
  const finalList = await client.listNotes(listRequest, { headers })
  const deletedNote = finalList.notes.find(note => note.id === noteId)

  if (!deletedNote) {
    throw new Error('Soft-deleted note was not found in the final list!')
  }

  if (!deletedNote.deletedAt) {
    throw new Error('Note was found but not marked as deleted!')
  }
  console.log(
    `  ✓ Note is correctly marked as deleted at ${deletedNote.deletedAt}.`,
  )

  console.log('✓ Notes API tests passed!')
}

async function testInteractionsApi() {
  console.log('\n🤝 Testing Interactions API...')

  const headers = createAuthHeaders(TEST_JWT_TOKEN)
  const testUserId = 'test-user-id-123'

  // 1. Create an interaction
  console.log('  - Creating a new interaction...')
  const asrOutput = {
    transcript: 'hello world',
    words: [
      { text: 'hello', start: 0, end: 1 },
      { text: 'world', start: 1, end: 2 },
    ],
  }
  const llmOutput = { response: 'Hello to you too!' }

  const createRequest = create(CreateInteractionRequestSchema, {
    id: uuidv4(),
    title: 'Test Interaction',
    asrOutput: JSON.stringify(asrOutput),
    llmOutput: JSON.stringify(llmOutput),
  })
  const createdInteraction = await client.createInteraction(createRequest, {
    headers,
  })
  console.log('  ✓ Interaction created successfully')
  const interactionId = createdInteraction.id
  if (JSON.parse(createdInteraction.asrOutput).transcript !== 'hello world') {
    throw new Error('ASR output mismatch on create')
  }

  // 2. List interactions
  console.log(`  - Listing interactions for user ${testUserId}...`)
  const listRequest = create(ListInteractionsRequestSchema, {})
  const listResponse = await client.listInteractions(listRequest, { headers })
  if (!listResponse.interactions.some(i => i.id === interactionId)) {
    throw new Error('Newly created interaction not found in list!')
  }
  console.log('  ✓ Newly created interaction is present in the list.')

  // 3. Get the specific interaction
  console.log(`  - Getting interaction by ID ${interactionId}...`)
  const getRequest = create(GetInteractionRequestSchema, { id: interactionId })
  const fetchedInteraction = await client.getInteraction(getRequest, {
    headers,
  })
  if (fetchedInteraction.title !== 'Test Interaction') {
    throw new Error('Fetched interaction title does not match!')
  }
  console.log('  ✓ Fetched interaction successfully.')

  // 4. Update the interaction
  console.log(`  - Updating interaction ID ${interactionId}...`)
  const updateRequest = create(UpdateInteractionRequestSchema, {
    id: interactionId,
    title: 'Updated Test Interaction',
  })
  const updatedInteraction = await client.updateInteraction(updateRequest, {
    headers,
  })
  if (updatedInteraction.title !== 'Updated Test Interaction') {
    throw new Error('Interaction title was not updated correctly!')
  }
  console.log('  ✓ Updated interaction successfully.')

  // 5. Delete the interaction
  console.log(`  - Deleting interaction ID ${interactionId}...`)
  const deleteRequest = create(DeleteInteractionRequestSchema, {
    id: interactionId,
  })
  await client.deleteInteraction(deleteRequest, { headers })
  console.log('  ✓ Delete request sent successfully.')

  // 6. Verify the interaction is now marked as deleted
  console.log(`  - Verifying interaction is marked as deleted in the list...`)
  const finalList = await client.listInteractions(listRequest, { headers })
  const deletedInteraction = finalList.interactions.find(
    i => i.id === interactionId,
  )

  if (!deletedInteraction) {
    throw new Error('Soft-deleted interaction was not found in the final list!')
  }

  if (!deletedInteraction.deletedAt) {
    throw new Error('Interaction was found but not marked as deleted!')
  }
  console.log(
    `  ✓ Interaction is correctly marked as deleted at ${deletedInteraction.deletedAt}.`,
  )

  console.log('✓ Interactions API tests passed!')
}

async function testDictionaryApi() {
  console.log('\n📚 Testing Dictionary API...')

  const headers = createAuthHeaders(TEST_JWT_TOKEN)
  const testUserId = 'test-user-id-123'

  // 1. Create a dictionary item
  console.log('  - Creating a new dictionary item...')
  const createRequest = create(CreateDictionaryItemRequestSchema, {
    id: uuidv4(),
    word: 'Ito',
    pronunciation: 'ee-toh',
  })
  const createdItem = await client.createDictionaryItem(createRequest, {
    headers,
  })
  console.log('  ✓ Dictionary item created successfully')
  const itemId = createdItem.id
  if (createdItem.word !== 'Ito') {
    throw new Error('Word mismatch on create')
  }

  // 2. List dictionary items
  console.log(`  - Listing dictionary items for user ${testUserId}...`)
  const listRequest = create(ListDictionaryItemsRequestSchema, {})
  const listResponse = await client.listDictionaryItems(listRequest, {
    headers,
  })
  if (!listResponse.items.some(i => i.id === itemId)) {
    throw new Error('Newly created dictionary item not found in list!')
  }
  console.log('  ✓ Newly created dictionary item is present in the list.')

  // 3. Update the dictionary item
  console.log(`  - Updating dictionary item ID ${itemId}...`)
  const updateRequest = create(UpdateDictionaryItemRequestSchema, {
    id: itemId,
    word: 'Ito',
    pronunciation: 'Eye-toh',
  })
  const updatedItem = await client.updateDictionaryItem(updateRequest, {
    headers,
  })
  if (updatedItem.pronunciation !== 'Eye-toh') {
    throw new Error('Dictionary item pronunciation was not updated correctly!')
  }
  console.log('  ✓ Updated dictionary item successfully.')

  // 4. Delete the dictionary item
  console.log(`  - Deleting dictionary item ID ${itemId}...`)
  const deleteRequest = create(DeleteDictionaryItemRequestSchema, {
    id: itemId,
  })
  await client.deleteDictionaryItem(deleteRequest, { headers })
  console.log('  ✓ Delete request sent successfully.')

  // 5. Verify the dictionary item is now marked as deleted
  console.log(
    `  - Verifying dictionary item is marked as deleted in the list...`,
  )
  const finalList = await client.listDictionaryItems(listRequest, { headers })
  const deletedItem = finalList.items.find(i => i.id === itemId)

  if (!deletedItem) {
    throw new Error(
      'Soft-deleted dictionary item was not found in the final list!',
    )
  }

  if (!deletedItem.deletedAt) {
    throw new Error('Dictionary item was found but not marked as deleted!')
  }
  console.log(
    `  ✓ Dictionary item is correctly marked as deleted at ${deletedItem.deletedAt}.`,
  )

  console.log('✓ Dictionary API tests passed!')
}

// Test the public health endpoint using fetch
async function testHealthEndpoint() {
  console.log('Testing public HTTP health endpoint...')

  try {
    const response = await fetch('http://localhost:3000/health')
    const data = await response.json()
    console.log('✓ Public health endpoint response:', data)
    return data
  } catch (error) {
    console.error('✗ Health endpoint test error:', error)
    throw error
  }
}

// Main test function
async function runTests() {
  console.log('='.repeat(70))
  console.log('🧪 Connect RPC + Auth0 Fastify Integration Test')
  console.log('='.repeat(70))

  try {
    console.log('TEST_JWT_TOKEN', TEST_JWT_TOKEN)

    // Test HTTP endpoints first
    console.log('\n📡 Testing HTTP Endpoints:')
    await testHealthEndpoint()

    if (TEST_JWT_TOKEN !== 'your-jwt-token-here') {
      console.log('\n🚀 Testing Authenticated Connect RPC calls:')
      await testNotesApi()
      await testInteractionsApi()
      await testDictionaryApi()

      console.log('\n🎉 All authenticated tests passed!')
    } else {
      console.log(
        '\n⚠️  To test authenticated RPC calls, set TEST_JWT_TOKEN environment variable',
      )
      console.log('   Get a token from your Auth0 application and run:')
      console.log('   export TEST_JWT_TOKEN="your-actual-jwt-token"')
      console.log('   npm run test-connect')
    }

    console.log('\n✅ All tests completed successfully!')
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  }

  process.exit(0)
}

runTests()
