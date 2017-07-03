const should = require('chai').should()
const fs = require('fs')
const fireman = require('../lib/index')

const db_filename = 'test/database.json'
const temp_filename = 'test/temp.json'

// fireman.useLogger(console.log)

beforeEach(() => {
    fireman.useLocalDB(db_filename)
})

describe('#get', () => {
    it('fetches user', () => {
        return fireman.get('/user/abcd').then(user => user.should.deep.equal({ name: 'Joshua Moreno', age: 85 }))
    })

    it('fetches users', () => {
        return fireman.get('/user').then(keys => Object.keys(keys).should.deep.equal(['abcd', 'efgh']))
    })

    it('fetches root', () => {
        return Promise.all([
            fireman.get('').then(keys => Object.keys(keys).should.deep.equal(['item', 'user'])),
            fireman.get('/').then(keys => Object.keys(keys).should.deep.equal(['item', 'user'])),
        ])
    })

    it('fetches limited users', () => {
        return Promise.all([
            fireman.get('/user', { orderBy: '$key', limitToLast: 1 }).then(users => Object.keys(users).should.deep.equal(['efgh'])),
            fireman.get('/user', { orderBy: 'age', limitToLast: 1, startAt: 10 }).then(users => Object.keys(users).should.deep.equal(['abcd'])),
        ])
    })

    it('sorts items by key', () => {
        return Promise.all([
            fireman.get('/item', { orderBy: '$key', limitToFirst: 3 }).then(item => item.should.deep.equal(['zeroth', 'first', 'second'])),
            fireman.get('/item', { orderBy: '$key', limitToFirst: 3, startAt: 1 }).then(item => item.should.deep.equal({ '1': 'first', '2': 'second', '10': 'tenth' })),
            fireman.get('/item', { orderBy: '$key', limitToLast: 3 }).then(item => item.should.deep.equal({ '1': 'first', '2': 'second', '10': 'tenth' })),
            fireman.get('/item', { orderBy: '$key', limitToLast: 3, startAt: 2 }).then(item => item.should.deep.equal({ '2': 'second', '10': 'tenth' })),
        ])
    })

    it('sorts items by value', () => {
        return Promise.all([
            fireman.get('/item', { orderBy: '$value', limitToFirst: 3 }).then(item => item.should.deep.equal({ '1': 'first', '2': 'second', '10': 'tenth' })),
            fireman.get('/item', { orderBy: '$value', limitToFirst: 3, startAt: 's' }).then(item => item.should.deep.equal({ '0': 'zeroth', '2': 'second', '10': 'tenth' })),
            fireman.get('/item', { orderBy: '$value', limitToLast: 3 }).then(item => item.should.deep.equal({ '0': 'zeroth', '2': 'second', '10': 'tenth' })),
            fireman.get('/item', { orderBy: '$value', limitToLast: 3, startAt: 's' }).then(item => item.should.deep.equal({ '0': 'zeroth', '2': 'second', '10': 'tenth' })),
        ])
    })

    it('fetches shallow users', () => {
        return fireman.get('/user', { shallow: true }).then(users => Object.keys(users).should.deep.equal(['abcd', 'efgh']))
    })
})

describe('#post', () => {
    it('adds comment', () => {
        return fireman.post('/comment', { body: 'Matter is neither created nor destroyed.' })
        .then(result => fireman.localDB.comment[result.name].should.deep.equal({ body: 'Matter is neither created nor destroyed.' }))
    })

    it('does not affect the root data', () => {
        const original = fireman.localDB
        return fireman.post('/comment', { body: 'The second.' })
        .then(result => fireman.localDB.comment[result.name].should.deep.equal({ body: 'The second.' }))
        .then(_ => should.not.exist(original.comment))
    })
})

describe('#put', () => {
    it('replaces user', () => {
        return fireman.put('/user/abcd', { name: 'Nancy Oconnell' })
        .then(result => result.should.deep.equal({ name: 'Nancy Oconnell' }))
        .then(_ => fireman.localDB.user.abcd.should.deep.equal({ name: 'Nancy Oconnell' }))
    })

    it('does not affect the root data', () => {
        const original = fireman.localDB
        return fireman.put('/user/abcd', { name: 'Fred Johnson' })
        .then(_ => fireman.localDB.user.abcd.name.should.equal('Fred Johnson'))
        .then(_ => original.user.abcd.name.should.equal('Joshua Moreno'))
    })
})

describe('#patch', () => {
    it('updates user', () => {
        return fireman.patch('/user/abcd', { name: 'Nancy Oconnell' })
        .then(result => result.should.deep.equal({ name: 'Nancy Oconnell' }))
        .then(_ => fireman.localDB.user.abcd.should.deep.equal({ name: 'Nancy Oconnell', age: 85 }))
    })

    it('does not affect the root data', () => {
        const original = fireman.localDB
        return fireman.patch('/user/abcd', { name: 'Fred Johnson' })
        .then(_ => fireman.localDB.user.abcd.name.should.equal('Fred Johnson'))
        .then(_ => original.user.abcd.name.should.equal('Joshua Moreno'))
    })
})

describe('#delete', () => {
    it('deletes user', () => {
        return fireman.delete('/user/efgh')
        .then(result => should.not.exist(result))
        .then(_ => should.not.exist(fireman.localDB.user.efgh))
    })

    it('does not affect the root data', () => {
        const original = fireman.localDB
        Promise.resolve()
        .then(_ => should.exist(fireman.localDB.user))
        .then(_ => fireman.delete('/user'))
        .then(_ => should.not.exist(fireman.localDB.user))
        .then(_ => should.exist(original.user))
    })
})

describe('#loading', () => {
    it('saves the database to file', () => {
        Promise.resolve()
        .then(_ => should.exist(fireman.localDB.user))
        .then(_ => fireman.delete('/user'))
        .then(_ => should.not.exist(fireman.localDB.user))
        .then(_ => fireman.load())
        .then(_ => should.exist(fireman.localDB.user))
    })
})

describe('#saving', () => {
    it('saves the database to file', () => {
        return new Promise((resolve, reject) => fs.createReadStream(db_filename).on('error', reject).pipe(fs.createWriteStream(temp_filename).on('close', resolve).on('error', reject)))
        .then(_ => fireman.useLocalDB(temp_filename))
        .then(_ => fireman.put(['/user', '/item'], 'empty'))
        .then(_ => fireman.save())
        .then(_ => fs.readFileSync(temp_filename, 'utf8'))
        .then(content => content.should.equal('{"user":"empty","item":"empty"}'))
        .then(_ => fs.unlinkSync(temp_filename))
    })
})

describe('#generateKey', () => {
    it('generates with fixed prefix', () => {
        fireman.keyForTimestamp(0).should.match(/^--------[A-Za-z0-9_-]{12}$/)
        fireman.keyForTimestamp(1).should.match(/^-------0[A-Za-z0-9_-]{12}$/)
        fireman.keyForTimestamp(1000).should.match(/^------Ec[A-Za-z0-9_-]{12}$/)
        fireman.keyForTimestamp(1000000).should.match(/^----2o8-[A-Za-z0-9_-]{12}$/)
        fireman.keyForTimestamp(1486072494923).should.match(/^-Kc-ofhA[A-Za-z0-9_-]{12}$/)
        fireman.keyForTimestamp(281474976710655).should.match(/^zzzzzzzz[A-Za-z0-9_-]{12}$/)
    })
})

describe('#timestampForKey', () => {
    it('reverses date from generated key', () => {
        fireman.timestampForKey('--------trHTBlfcaOg3').should.equal(0)
        fireman.timestampForKey('-------0W_AvbIPV-hTf').should.equal(1)
        fireman.timestampForKey('------Echeo0gL_kxHCr').should.equal(1000)
        fireman.timestampForKey('----2o8-tNE2SRVeWADl').should.equal(1000000)
        fireman.timestampForKey('---48_k-S4pTebdGH_IB').should.equal(86400000)
        fireman.timestampForKey('-Kc-ofhA2uGpymUI1CLf').should.equal(1486072494923)
        fireman.timestampForKey('zzzzzzzz9vmDck6jy-qC').should.equal(281474976710655)
    })
})

describe('logging', () => {
    it('prints to console', () => {
        // fireman.useLogger(console.log)
        fireman.get('writing', { startAt: 'console.log' })
    })

    it('prints to logger', () => {
        const did = { write: false }
        fireman.useLogger((operation, path, query) => {
            operation.should.equal('get')
            path.should.equal('writing')
            query.should.deep.equal({ startAt: 'here' })
            did.write = true
        })
        fireman.get('writing', { startAt: 'here' })
        did.write.should.equal(true)
        fireman.useLogger()
    })
})
