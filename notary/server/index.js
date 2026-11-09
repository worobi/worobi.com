'use strict';
const { createApp } = require('./app');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
createApp().listen(port, '0.0.0.0', () => console.log('Worobi Notary listening on port ' + port));
