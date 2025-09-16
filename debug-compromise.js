import nlp from 'compromise'

const testWords = ['monday', 'january', 'john', 'microsoft', 'california', 'new york', 'Monday', 'January']

testWords.forEach(word => {
  const doc = nlp(word)
  console.log(`Word: "${word}"`)
  console.log(`  Debug:`, doc.debug())
  console.log(`  ProperNoun: ${doc.has('#ProperNoun')}`)
  console.log(`  Person: ${doc.has('#Person')}`)
  console.log(`  Place: ${doc.has('#Place')}`)
  console.log(`  Organization: ${doc.has('#Organization')}`)
  console.log(`  WeekDay: ${doc.has('#WeekDay')}`)
  console.log(`  Month: ${doc.has('#Month')}`)
  console.log('---')
})