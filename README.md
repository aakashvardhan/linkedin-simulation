# LinkedIn Simulation M3/M4 Backend

## 1. Project Scope
This backend covers:
- Profile Service
- Job Service
- Connection Service

## 2. Tech Stack
- Python 3.11+
- FastAPI
- SQLAlchemy
- MySQL
- MongoDB
- Docker
- Uvicorn

## 3. Folder Placement
Place this `README.md` in the project root, where these files/folders exist:
- `app/`
- `requirements.txt`
- `schema.sql`
- `.env`

## 4. Create Virtual Environment
Run these commands from the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

## 5. Install Python Dependencies
```bash
pip install -r requirements.txt
```

## 6. Create `.env` File
Create a file named `.env` in the project root and paste this:

```env
APP_NAME=LinkedIn Simulation M3/M4 Backend
APP_HOST=0.0.0.0
APP_PORT=8000
DEBUG=true
AUTO_CREATE_SCHEMA=true

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DB=linkedin_simulation
MYSQL_USER=root
MYSQL_PASSWORD=YOUR_MYSQL_PASSWORD

MONGO_URI=mongodb://localhost:27017
MONGO_DB=linkedin_simulation

ENABLE_KAFKA=false
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_CLIENT_ID=linkedin-m3m4-backend
KAFKA_CONSUMER_GROUP=linkedin-events-consumer
```

## 7. Start MySQL
Open MySQL:

```bash
mysql -u root -p
```

Create the database:

```sql
CREATE DATABASE IF NOT EXISTS linkedin_simulation;
EXIT;
```

Load the schema:

```bash
mysql -u root -p linkedin_simulation < schema.sql
```

## 8. Start MongoDB
### Option A: Use existing Docker container
If you already have a MongoDB container:

```bash
docker start mongo
docker port mongo
```

Make sure the port mapping shows `27017`.

### Option B: Run a new MongoDB container
```bash
docker run -d --name yelp-mongo -p 27017:27017 mongo:7
```

## 9. Start the Backend
Run this from the project root:

```bash
python -m uvicorn app.main:app --reload --port 8000
```

## 10. Open Swagger UI
Open this in your browser:

```text
http://127.0.0.1:8000/docs
```

## 11. Recommended API Test Order
Test in this order:
1. `POST /members/create`
2. `POST /members/login`
3. `POST /recruiters/create`
4. `POST /recruiters/login`
5. `POST /jobs/create`
6. `POST /jobs/search`
7. `POST /jobs/save`
8. `POST /connections/request`
9. `POST /connections/pending`
10. `POST /connections/accept`
11. `POST /connections/list`

## 12. Notes
- Use the actual IDs returned by create APIs in later requests.
- Keep `ENABLE_KAFKA=false` for initial API testing.
- Change `YOUR_MYSQL_PASSWORD` in `.env` to your local MySQL password.
- MongoDB is needed for event-related collections and startup index creation.
- MySQL is used for members, recruiters, companies, job postings, connections, and saved jobs.

## 13. Common Issues
### MySQL connection error
- Check MySQL is running.
- Check `.env` values.
- Make sure `linkedin_simulation` database exists.

### MongoDB connection error
- Start the MongoDB Docker container.
- Confirm port `27017` is mapped.

### Duplicate email error
- Use a new email for `/members/create`.

### API not opening
- Make sure Uvicorn is running on port `8000`.
- Open `http://127.0.0.1:8000/docs`

## 14. Stop Services
To stop the backend:
- Press `CTRL + C`

To stop MongoDB container:
```bash
docker stop mongo
```
