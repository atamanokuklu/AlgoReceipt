import 'dotenv/config';
import { app } from './app.js';
import { settings } from './config.js';

app.listen(settings.PORT, () => {
  console.log(`Server listening on http://localhost:${settings.PORT}`);
});
