const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const ORG_SUFFIX = Math.floor(Math.random() * 10000); // Randomize to avoid collision on repeated runs
const USER = {
    GYMNAME: `TestGym_${ORG_SUFFIX}`,
    EMAILID: `test${ORG_SUFFIX}@gym.com`,
    username: `gymowner${ORG_SUFFIX}`,
    password: 'password123'
};

async function verify() {
    try {
        console.log("1. Testing Signup...");
        try {
            await axios.post(`${BASE_URL}/auth/signup`, USER);
            console.log("   Signup Successful");
        } catch (e) {
            console.log("   Signup Failed:", e.response?.data || e.message);
            if (e.response?.arg?.includes('exists')) console.log("   (Might happen if re-running)");
        }

        console.log("2. Testing Login...");
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            username: USER.username,
            password: USER.password
        });
        const token = loginRes.data.eztracker_jwt_access_control_token;
        console.log("   Login Successful, Token received");

        const authHeaders = {
            headers: { Authorization: `Bearer ${token}` }
        };

        console.log("3. Testing Create Member...");
        const newMember = {
            Name: "John Doe",
            MembershipReceiptnumber: 101,
            Gender: "Male",
            Age: 30,
            DateOfJoining: "2023-01-01",
            PlanPeriod: "1 Month",
            PlanType: "Gold",
            Mobile: "9876543210"
        };
        const createRes = await axios.post(`${BASE_URL}/members`, newMember, authHeaders);
        const memberId = createRes.data.id;
        console.log("   Create Member Successful, ID:", memberId);

        console.log("4. Testing Fetch Members...");
        const fetchRes = await axios.get(`${BASE_URL}/members`, authHeaders);
        const members = fetchRes.data;
        if (members.find(m => m.id === memberId)) {
            console.log("   Fetch Members Successful (Member found)");
        } else {
            console.error("   Fetch Members Failed (Member not found)");
        }

        console.log("5. Testing Update Member...");
        const updateRes = await axios.put(`${BASE_URL}/members/${memberId}`, { Age: 31 }, authHeaders);
        if (updateRes.data.Age === 31) {
            console.log("   Update Member Successful");
        } else {
            console.error("   Update Member mismatch");
        }

        console.log("6. Testing Delete Member...");
        await axios.delete(`${BASE_URL}/members/${memberId}`, authHeaders);
        console.log("   Delete Member Successful");

        console.log("\nBackend Verification Complete!");

    } catch (error) {
        console.error("Verification failed:", error.response?.data || error.message);
    }
}

verify();
