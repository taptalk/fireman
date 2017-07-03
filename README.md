<img src="icon.jpg" alt="Fireman Icon" width="72"/>


Fireman
=======

*A wrapper around both Firebase REST API and local in-memory database.*

Fireman provides a unified interface to both remote firebase database and local flame database. This allows for easy switching between the Firebase REST API in production and a local in-memory database for development and testing.


## Installation

    npm install @leonardvandriel/fireman


## Usage

    const fireman = require('@leonardvandriel/fireman')

    // either setup fireman to use local database:
    fireman.useLocalDb('database.json')
    // or setup fireman to use remote database:
    fireman.appName = '..'
    fireman.apiKey = '..'

    // Read user
    console.log(fireman.get('/user/abcd'))

    // Add user
    fireman.put('/user/efgh', { name: 'Romona Moten', age: 20 })

    // Query users
    console.log(fireman.get('/user/abcd', { orderBy: 'age', limitToLast: 1, startAt: 10 }))


## Tests

    npm test


## License

Fireman is licensed under the terms of the BSD 3-Clause License, see the included LICENSE file.


## Authors

- Leo Vandriel
