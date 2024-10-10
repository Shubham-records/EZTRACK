import datetime
import random
import smtplib
from flask import Flask, jsonify, request, send_from_directory
from pymongo import MongoClient
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from cryptography.fernet import Fernet
from bson.objectid import ObjectId
import os
from dotenv import load_dotenv

app = Flask(__name__)
load_dotenv()
# Additional modules initiated
CORS(app, supports_credentials=True)
client = MongoClient(os.getenv("MongoDBLink"))
app.config['SECRET_KEY'] = os.getenv("FlaskAppSECRET_KEY")
app.config['JWT_SECRET_KEY'] = os.getenv("JWT_SECRET_KEY")
jwt = JWTManager(app)
key = Fernet.generate_key()
cipher_suite = Fernet(key)

# SMTP Configuration
MyEmail = os.getenv("MyEmail")
password = os.getenv("password")
otp_storage = {}

# Login & signup and authentication

def encrypt_database_name(database_name):
    return cipher_suite.encrypt(database_name.encode()).decode()

def decrypt_database_name(encrypted_db_name):
    return cipher_suite.decrypt(encrypted_db_name.encode()).decode()

def email_exists_globally(email):
    gym_dbs = client.list_database_names()
    for gym in gym_dbs:
        gym_db = client[gym]
        if "credentials" in gym_db.list_collection_names():
            if gym_db.credentials.find_one({"email": email}):
                return True
    return False

def username_exists_globally(username):
    gym_dbs = client.list_database_names()
    for gym in gym_dbs:
        gym_db = client[gym]
        if "credentials" in gym_db.list_collection_names():
            if gym_db.credentials.find_one({"username": username}):
                return True
    return False

def ISusername_exists_globally(username):
    gym_dbs = client.list_database_names()
    for gym in gym_dbs:
        gym_db = client[gym]
        if "credentials" in gym_db.list_collection_names():
            user = gym_db.credentials.find_one({"username": username})
            if user:
                return user, gym
    return None, None

# Signup
@app.route('/signupcheck', methods=["POST"])
def signupcheck():
    try:
        gymname = request.json.get('GYMNAME')
        email = request.json.get('EMAILID')
        username = request.json.get('username')
        password = request.json.get('password')

        if gymname in client.list_database_names() and client[gymname].credentials.find_one({"email": email}):
            return f"{gymname} and {email} are already registered!", 400
        elif gymname in client.list_database_names():
            return f"{gymname} is already registered!", 400
        elif email_exists_globally(email):
            return "Email already registered in another gym!", 400
        elif username_exists_globally(username):
            return "Username already exists!", 400
        
        hashed_password = generate_password_hash(password, method='pbkdf2:sha256:600000', salt_length=16)
        
        client[gymname].credentials.insert_one({
            "gymname": gymname,
            "email": email,
            "username": username,
            "password": hashed_password  
        })

        return "Registered Successfully!", 201

    except Exception as e:
        print(f"Error during registration: {str(e)}")
        return "An error occurred during registration.", 500
    
# Login
@app.route('/logincheck', methods=['POST'])
def logincheck():
    try:
        if request.method == "POST":
            username = request.json.get('username')
            password = request.json.get('password')

        user_data, databaseName = ISusername_exists_globally(username)
        if not user_data:  
            return jsonify({"message": "Username not found!"}), 404  

        if not check_password_hash(user_data["password"], password):
            return jsonify({"message": "Incorrect password!"}), 401 
        
        encrypted_database_name = encrypt_database_name(databaseName)

        access_token = create_access_token(identity=username, expires_delta=datetime.timedelta(hours=1))
        response = jsonify({"message": "Login successful!","access_token":access_token, "databaseName":encrypted_database_name})
        return response, 200  

    except Exception as e:
        print(str(e)) 
        return jsonify({"message": "An error occurred during login."}), 500
# Login Out    
@app.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    try:
        current_user = get_jwt_identity()
        print(f"User {current_user} logged out")

        response = jsonify({"message": "Logged out successfully!"})
        
        return response

    except Exception as e:
        print(f"Error during logout: {str(e)}")
        return jsonify({"message": "An error occurred during logout."}), 500

# Password change and OTP verification

def send_email(to_email, otp):
    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as connection:
            connection.starttls()
            connection.login(user=MyEmail, password=password)
            subject = "Your OTP Code"
            body = f"Your OTP code is {otp}. It is valid for 10 minutes."
            message = f"Subject:{subject}\n\n{body}"
            connection.sendmail(from_addr=MyEmail, to_addrs=to_email, msg=message)
    except Exception as e:
        print(f"Error sending email: {str(e)}")

@app.route('/request_otp', methods=["POST"])
def request_otp():
    try:
        email = request.json.get('email')
        
        if not email_exists_globally(email):
            return jsonify({"message": "Invalid email address."}), 400

        otp = random.randint(100000, 999999)
        otp_storage[email] = otp 

        send_email(email, otp)

        return jsonify({"message": "OTP sent to your email!"}), 200
    except Exception as e:
        print(f"Error sending email: {str(e)}")

@app.route('/verify_otp', methods=["POST"])
def verify_otp():
    data = request.json
    email = data.get('email')
    otp = data.get('otp')

    if email in otp_storage and otp_storage[email] == int(otp):
        del otp_storage[email]  # Remove OTP after successful verification
        return jsonify({"message": "OTP verified! You can now reset your password."}), 200
    else:
        return jsonify({"message": "Invalid OTP or OTP expired."}), 400

@app.route('/reset_password', methods=["POST"])
def reset_password():
    data = request.json
    email = data.get('email')
    new_password = data.get('password')

    hashed_new_password = generate_password_hash(new_password, method='pbkdf2:sha256:600000', salt_length=16)
    gym_dbs = client.list_database_names()

    for gym in gym_dbs:
        gym_db = client[gym]
        if "credentials" in gym_db.list_collection_names():
            userData = gym_db.credentials.find_one({"email": email})
            if userData:
                gym_db.credentials.update_one(
                    {"email": email}, 
                    {"$set": {"password": hashed_new_password}}  
                )
                return jsonify({"message": "Password reset successfully!"}), 200
    return jsonify({"message": "Password reset Failed!"}), 400 
     

# Fetch data
@app.route('/members', methods=['GET'], endpoint='fetch_members')
@jwt_required()
def Fetch_members():
    encrypted_db_name = request.headers.get('X-Database-Name')
    if not encrypted_db_name:
        return jsonify({"message": "No database name provided."}), 400
    
    database_name = decrypt_database_name(encrypted_db_name)
    print(database_name)
    
    members = list(client[database_name].Member_DB.find())
    for member in members:
        if member['_id']:
            member['_id'] = str(member['_id']) 
    return jsonify(members), 200 

@app.route('/proteins', methods=['GET'], endpoint='fetch_proteins')
@jwt_required()
def Fetch_proteins():

    encrypted_db_name = request.headers.get('X-Database-Name')
    if not encrypted_db_name:
        return jsonify({"message": "No database name provided."}), 400
    
    database_name = decrypt_database_name(encrypted_db_name)
    print(database_name)
    
    proteins = list(client[database_name].ProteinSTOCKS_DB.find())
    for protein in proteins:
        if protein['_id']:
            protein['_id'] = str(protein['_id']) 
    return jsonify(proteins), 200 

@app.route('/membersUpdate/<member_id>', methods=['PUT'])
@jwt_required()
def update_member(member_id):
    data = request.json

    encrypted_db_name = request.headers.get('X-Database-Name')
    if not encrypted_db_name:
        return jsonify({"message": "No database name provided."}), 400
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    database_name = decrypt_database_name(encrypted_db_name)
    print(database_name)

    members_collection = client[database_name].Member_DB

    try:
        object_id = ObjectId(member_id)
    except InvalidId:
        return jsonify({"error": "Invalid member ID"}), 400

    # Remove _id from data if it exists to prevent the error
    data.pop('_id', None)
    
    result = members_collection.update_one({'_id': object_id}, {'$set': data})

    if result.matched_count > 0:
        updated_member = members_collection.find_one({'_id': object_id})
        updated_member['_id'] = str(updated_member['_id'])  # Convert ObjectId to string for frontend
        return jsonify(updated_member)
    else:
        return jsonify({"error": "Member not found"}), 404

@app.route('/membersDelete/<id>', methods=['DELETE'])
@jwt_required()
def delete_member(id):
    encrypted_db_name = request.headers.get('X-Database-Name')
    if not encrypted_db_name:
        return jsonify({"message": "No database name provided."}), 400
    
    database_name = decrypt_database_name(encrypted_db_name)
    print(database_name)
    members_collection = client[database_name]['Member_DB']

    try:
        object_id = ObjectId(id)
    except InvalidId:
        return jsonify({"error": "Invalid member ID"}), 400
    
    result = members_collection.delete_one({'_id': object_id})

    if result.deleted_count > 0:
        return jsonify({'message': 'Member deleted'})
    else:
        return jsonify({"message": "Member not found"}), 404

@app.route('/proteinsUpdate/<protein_id>', methods=['PUT'])
@jwt_required()
def update_protein(protein_id):
    data = request.json

    encrypted_db_name = request.headers.get('X-Database-Name')
    if not encrypted_db_name:
        return jsonify({"message": "No database name provided."}), 400
    
    if not data:
        return jsonify({"error": "No data provided"}), 400

    database_name = decrypt_database_name(encrypted_db_name)
    print(database_name)

    proteins_collection = client[database_name].ProteinSTOCKS_DB

    try:
        object_id = ObjectId(protein_id)
    except InvalidId:
        return jsonify({"error": "Invalid protein ID"}), 400

    # Remove _id from data to prevent update error
    data.pop('_id', None)

    result = proteins_collection.update_one({'_id': object_id}, {'$set': data})

    if result.matched_count > 0:
        updated_protein = proteins_collection.find_one({'_id': object_id})
        updated_protein['_id'] = str(updated_protein['_id'])  # Convert ObjectId to string
        return jsonify(updated_protein)
    else:
        return jsonify({"error": "Protein not found"}), 404

@app.route('/proteinsDelete/<protein_id>', methods=['DELETE'])
@jwt_required()
def delete_protein(protein_id):
    encrypted_db_name = request.headers.get('X-Database-Name')
    if not encrypted_db_name:
        return jsonify({"message": "No database name provided."}), 400

    database_name = decrypt_database_name(encrypted_db_name)
    print(database_name)

    proteins_collection = client[database_name].ProteinSTOCKS_DB

    try:
        object_id = ObjectId(protein_id)
    except InvalidId:
        return jsonify({"error": "Invalid protein ID"}), 400

    result = proteins_collection.delete_one({'_id': object_id})

    if result.deleted_count > 0:
        return jsonify({"message": "Protein deleted successfully"}), 200
    else:
        return jsonify({"error": "Protein not found"}), 404

    encrypted_db_name = request.headers.get('X-Database-Name')
    if not encrypted_db_name:
        return jsonify({"message": "No database name provided."}), 400

    database_name = decrypt_database_name(encrypted_db_name)

    proteins_collection = client[database_name].ProteinSTOCKS_DB  
    
    result = proteins_collection.delete_one({'_id': ObjectId(protein_id)})

    if result.deleted_count > 0:
        return jsonify({"message": "Protein deleted successfully"}), 200
    else:
        return jsonify({"error": "Protein not found"}), 404

# generate client no.
@app.route('/generateClientNumber', methods=['GET'])
@jwt_required()
def get_client_number():
    try:
        encrypted_db_name = request.headers.get('X-Database-Name')
        database_name = decrypt_database_name(encrypted_db_name)
        
        highest_receipt = client[database_name].Member_DB.find_one(
            {"MembershipReceiptnumber": {"$type": "int"}},
            sort=[("MembershipReceiptnumber", -1)]
        )
        highest_number = highest_receipt['MembershipReceiptnumber'] if highest_receipt else 0
        next_client_number = highest_number + 1

        return jsonify({"clientNumber": next_client_number})
    except Exception as e:
            print(f"Error occurred: {str(e)}")
            return jsonify({"error": str(e)}), 500 


@app.route('/newAdmission', methods=['POST'])
@jwt_required()
def new_admission():
    try:
        current_user = get_jwt_identity()
        print(f"User {current_user} is attempting to add a new admission")

        encrypted_db_name = request.headers.get('X-Database-Name')
        if not encrypted_db_name:
            return jsonify({"error": "No database name provided."}), 400
        
        database_name = decrypt_database_name(encrypted_db_name)
        print(f"Using database: {database_name}")
        
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400

        required_fields = ['Name', 'MembershipReceiptnumber', 'Gender', 'Age', 'DateOfJoining', 'PlanPeriod', 'PlanType']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({"error": f"Missing required field: {field}"}), 400
        check_fields = ['Name','Mobile', 'Whatsapp', ]
        for i in check_fields:
            existing_member = client[database_name].Member_DB.find_one({i: data[i]})
            if existing_member:
                return jsonify({"error": f"{i} already exists. You have already added this member."}), 400
        
        int_fields = ['MembershipReceiptnumber', 'Age', 'weight', 'Mobile', 'Whatsapp', 'Aadhaar', 'LastPaymentAmount', 'RenewalReceiptNumber', 'extraDays']
        float_fields = ['height']

        for field in int_fields:
            if field in data and data[field] is not None:
                try:
                    data[field] = int(data[field])
                except ValueError:
                    return jsonify({"error": f"Invalid integer value for {field}"}), 400

        for field in float_fields:
            if field in data and data[field] is not None:
                try:
                    data[field] = float(data[field])
                except ValueError:
                    return jsonify({"error": f"Invalid float value for {field}"}), 400

        date_fields = ['DateOfJoining', 'DateOfReJoin', 'MembershipExpiryDate', 'LastPaymentDate', 'NextDuedate']
        for field in date_fields:
            if field in data and data[field]:
                try:
                    date_obj = datetime.datetime.strptime(data[field], '%Y-%m-%d')
                    data[field] = date_obj.strftime('%Y-%m-%d')
                except ValueError as e:
                    return jsonify({"error": f"Invalid date format for {field}. Expected yyyy-MM-dd. Error: {str(e)}"}), 400
        
        result = client[database_name].Member_DB.insert_one(data)

        if result.inserted_id:
            return jsonify({
                "message": "New admission added successfully",
                "id": str(result.inserted_id)
            }), 201
        else:
            return jsonify({"error": "Failed to add new admission"}), 500
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        return jsonify({"error": f"An error occurred while submitting the form: {str(e)}"}), 500
    

@app.route('/fetchClient/<client_number>', methods=['GET'])
@jwt_required()
def fetch_client(client_number):
    try:
        encrypted_db_name = request.headers.get('X-Database-Name')
        if not encrypted_db_name:
            return jsonify({"message": "No database name provided."}), 400
        
        database_name = decrypt_database_name(encrypted_db_name)
        
        client_data = client[database_name].Member_DB.find_one({"MembershipReceiptnumber": int(client_number)})
        
        if not client_data:
            client_data = client[database_name].Member_DB.find_one({"MembershipReceiptnumber": client_number})
        
        if client_data:
            client_data['_id'] = str(client_data['_id'])
            return jsonify(client_data), 200
        else:
            return jsonify({"message": "Client not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/reAdmission', methods=['POST'])
@jwt_required()
def re_admission():
    try:
        current_user = get_jwt_identity()
        encrypted_db_name = request.headers.get('X-Database-Name')
        if not encrypted_db_name:
            return jsonify({"error": "No database name provided."}), 400
        
        database_name = decrypt_database_name(encrypted_db_name)
        data = request.json
        
        if not data:
            return jsonify({"error": "No data provided"}), 400

        required_fields = ['Name', 'MembershipReceiptnumber', 'Gender', 'Age', 'DateOfReJoin', 'PlanPeriod', 'PlanType']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({"error": f"Missing required field: {field}"}), 400

        int_fields = ['MembershipReceiptnumber', 'Age', 'weight', 'Mobile', 'Whatsapp', 'Aadhaar', 'LastPaymentAmount', 'RenewalReceiptNumber', 'extraDays']
        float_fields = ['height']

        for field in int_fields:
            if field in data and data[field] is not None:
                try:
                    data[field] = int(data[field])
                except ValueError:
                    return jsonify({"error": f"Invalid integer value for {field}"}), 400

        for field in float_fields:
            if field in data and data[field] is not None:
                try:
                    data[field] = float(data[field])
                except ValueError:
                    return jsonify({"error": f"Invalid float value for {field}"}), 400

        date_fields = ['DateOfJoining', 'DateOfReJoin', 'MembershipExpiryDate', 'LastPaymentDate', 'NextDuedate']
        for field in date_fields:
            if field in data and data[field]:
                try:
                    date_obj = datetime.datetime.strptime(data[field], '%Y-%m-%d')
                    data[field] = date_obj.strftime('%Y-%m-%d')
                except ValueError as e:
                    return jsonify({"error": f"Invalid date format for {field}. Expected yyyy-MM-dd. Error: {str(e)}"}), 400

        data['DateOfReJoin'] = datetime.datetime.now().strftime('%Y-%m-%d')
        data['MembershipStatus'] = 'Active'
        
        result = client[database_name].Member_DB.update_one(
            {"MembershipReceiptnumber": data['MembershipReceiptnumber']},
            {"$set": data}
        )

        if result.modified_count > 0:
            return jsonify({
                "message": "Re-admission updated successfully",
                "id": str(data['MembershipReceiptnumber'])
            }), 200
        else:
            return jsonify({"error": "Failed to update re-admission or no changes made"}), 400
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        return jsonify({"error": f"An error occurred while submitting the form: {str(e)}"}), 500

@app.route('/fetchClientForRenewal/<client_number>', methods=['GET'])
@jwt_required()
def fetch_client_for_renewal(client_number):
    try:
        encrypted_db_name = request.headers.get('X-Database-Name')
        if not encrypted_db_name:
            return jsonify({"message": "No database name provided."}), 400
        
        database_name = decrypt_database_name(encrypted_db_name)
        
        client_data = client[database_name].Member_DB.find_one({"MembershipReceiptnumber": int(client_number)})
        
        if not client_data:
            client_data = client[database_name].Member_DB.find_one({"MembershipReceiptnumber": client_number})
        
        if client_data:
            renewal_data = {
                "Name": client_data.get('Name'),
                "MembershipReceiptnumber": client_data.get('MembershipReceiptnumber'),
                "LastPaymentDate": client_data.get('LastPaymentDate'),
                "LastValidityDate": client_data.get('MembershipExpiryDate'),
                "LastMembershipType": client_data.get('PlanType'),
                "Mobile": client_data.get('Mobile'),
                "PlanPeriod": client_data.get('PlanPeriod'),
                "PlanType": client_data.get('PlanType')
            }
            return jsonify(renewal_data), 200
        else:
            return jsonify({"message": "Client not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/renewal', methods=['POST'])
@jwt_required()
def renewal():
    try:
        current_user = get_jwt_identity()
        encrypted_db_name = request.headers.get('X-Database-Name')
        if not encrypted_db_name:
            return jsonify({"error": "No database name provided."}), 400
        
        database_name = decrypt_database_name(encrypted_db_name)
        data = request.json
        
        if not data:
            return jsonify({"error": "No data provided"}), 400

        required_fields = ['Name', 'MembershipReceiptnumber', 'DateOfRenewal', 'PlanPeriod', 'PlanType']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({"error": f"Missing required field: {field}"}), 400

        int_fields = ['MembershipReceiptnumber', 'Mobile', 'LastPaymentAmount', 'RenewalReceiptNumber', 'extraDays']
        for field in int_fields:
            if field in data and data[field] is not None:
                try:
                    data[field] = int(data[field])
                except ValueError:
                    return jsonify({"error": f"Invalid integer value for {field}"}), 400

        date_fields = ['DateOfRenewal', 'MembershipExpiryDate', 'LastPaymentDate', 'NextDuedate']
        for field in date_fields:
            if field in data and data[field]:
                try:
                    date_obj = datetime.strptime(data[field], '%Y-%m-%d')
                    data[field] = date_obj.strftime('%Y-%m-%d')
                except ValueError as e:
                    return jsonify({"error": f"Invalid date format for {field}. Expected yyyy-MM-dd. Error: {str(e)}"}), 400

        data['LastPaymentDate'] = data['DateOfRenewal']
        data['MembershipStatus'] = 'Active'
        
        result = client[database_name].Member_DB.update_one(
            {"MembershipReceiptnumber": data['MembershipReceiptnumber']},
            {"$set": data}
        )

        if result.modified_count > 0:
            return jsonify({
                "message": "Renewal updated successfully",
                "id": str(data['MembershipReceiptnumber'])
            }), 200
        else:
            return jsonify({"error": "Failed to update renewal or no changes made"}), 400
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        return jsonify({"error": f"An error occurred while submitting the form: {str(e)}"}), 500


@app.route('/perDayBasis', methods=['POST'])
@jwt_required()
def per_day_basis():
    try:
        current_user = get_jwt_identity()
        print(f"User {current_user} is attempting to add a per-day basis admission")

        encrypted_db_name = request.headers.get('X-Database-Name')
        if not encrypted_db_name:
            return jsonify({"error": "No database name provided."}), 400
        
        database_name = decrypt_database_name(encrypted_db_name)
        print(f"Using database: {database_name}")
        
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400

        required_fields = ['Name', 'Gender', 'Age', 'PlanType', 'Days', 'StartDate', 'EndDate', 'Amount']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({"error": f"Missing required field: {field}"}), 400

        int_fields = ['Age', 'weight', 'Mobile', 'Whatsapp', 'Aadhaar', 'Days', 'Amount']
        float_fields = ['height']

        for field in int_fields:
            if field in data and data[field] is not None:
                try:
                    data[field] = int(data[field])
                except ValueError:
                    return jsonify({"error": f"Invalid integer value for {field}"}), 400

        for field in float_fields:
            if field in data and data[field] is not None:
                try:
                    data[field] = float(data[field])
                except ValueError:
                    return jsonify({"error": f"Invalid float value for {field}"}), 400

        date_fields = ['StartDate', 'EndDate']
        for field in date_fields:
            if field in data and data[field]:
                try:
                    date_obj = datetime.datetime.strptime(data[field], '%Y-%m-%d')
                    data[field] = date_obj.strftime('%Y-%m-%d')
                except ValueError as e:
                    return jsonify({"error": f"Invalid date format for {field}. Expected yyyy-MM-dd. Error: {str(e)}"}), 400
        
        result = client[database_name].PerDayBasis_DB.insert_one(data)

        if result.inserted_id:
            return jsonify({
                "message": "Per-day basis admission added successfully",
                "id": str(result.inserted_id)
            }), 201
        else:
            return jsonify({"error": "Failed to add per-day basis admission"}), 500
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        return jsonify({"error": f"An error occurred while submitting the form: {str(e)}"}), 500

@app.route('/fetchClientForReturn/<client_number>', methods=['GET'])
@jwt_required()
def fetch_client_for_return(client_number):
    try:
        encrypted_db_name = request.headers.get('X-Database-Name')
        if not encrypted_db_name:
            return jsonify({"message": "No database name provided."}), 400
        
        database_name = decrypt_database_name(encrypted_db_name)
        
        client_data = client[database_name].Member_DB.find_one({"MembershipReceiptnumber": int(client_number)})
        
        if not client_data:
            client_data = client[database_name].Member_DB.find_one({"MembershipReceiptnumber": client_number})
        
        if client_data:
            return_data = {
                "Name": client_data.get('Name'),
                "MembershipReceiptnumber": client_data.get('MembershipReceiptnumber'),
                "LastPaymentDate": client_data.get('LastPaymentDate'),
                "LastValidityDate": client_data.get('MembershipExpiryDate'),
                "LastMembershipType": client_data.get('PlanType'),
                "Mobile": client_data.get('Mobile'),
                "PlanPeriod": client_data.get('PlanPeriod'),
                "PlanType": client_data.get('PlanType')
            }
            return jsonify(return_data), 200
        else:
            return jsonify({"message": "Client not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/returnMembership', methods=['POST'])
@jwt_required()
def return_membership():
    try:
        current_user = get_jwt_identity()
        encrypted_db_name = request.headers.get('X-Database-Name')
        if not encrypted_db_name:
            return jsonify({"error": "No database name provided."}), 400
        
        database_name = decrypt_database_name(encrypted_db_name)
        data = request.json
        
        if not data:
            return jsonify({"error": "No data provided"}), 400

        required_fields = ['MembershipReceiptnumber', 'ReturnDate', 'RemainingDays', 'RefundAmount', 'Reason']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({"error": f"Missing required field: {field}"}), 400

        int_fields = ['MembershipReceiptnumber', 'Mobile', 'RemainingDays', 'RefundAmount']
        for field in int_fields:
            if field in data and data[field] is not None:
                try:
                    data[field] = int(data[field])
                except ValueError:
                    return jsonify({"error": f"Invalid integer value for {field}"}), 400

        date_fields = ['ReturnDate']
        for field in date_fields:
            if field in data and data[field]:
                try:
                    date_obj = datetime.datetime.strptime(data[field], '%Y-%m-d')
                    data[field] = date_obj.strftime('%Y-%m-%d')
                except ValueError as e:
                    return jsonify({"error": f"Invalid date format for {field}. Expected yyyy-MM-dd. Error: {str(e)}"}), 400

        update_result = client[database_name].Member_DB.update_one(
            {"MembershipReceiptnumber": data['MembershipReceiptnumber']},
            {
                "$set": {
                    "MembershipStatus": "Returned",
                    "ReturnDate": data['ReturnDate'],
                    "RefundAmount": data['RefundAmount'],
                    "ReturnReason": data['Reason']
                }
            }
        )

        if update_result.modified_count > 0:
            return_log = {
                "MembershipReceiptnumber": data['MembershipReceiptnumber'],
                "ReturnDate": data['ReturnDate'],
                "RemainingDays": data['RemainingDays'],
                "RefundAmount": data['RefundAmount'],
                "Reason": data['Reason']
            }
            client[database_name].MembershipReturns_DB.insert_one(return_log)

            return jsonify({
                "message": "Membership return processed successfully",
                "id": str(data['MembershipReceiptnumber'])
            }), 200
        else:
            return jsonify({"error": "Failed to process membership return or no changes made"}), 400
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        return jsonify({"error": f"An error occurred while processing the return: {str(e)}"}), 500



frontend_folder = os.path.join(os.getcwd(),"..","frontend","dist")


@app.route("/", defaults={"filename":""})
@app.route("/<path:filename>")
def index(filename):
    if not filename:
        filename = "index.html"
    return send_from_directory(frontend_folder, filename)





if __name__ == "__main__":
    app.run()
