
import React, { useState, useEffect } from 'react'

export default function BmiCalculator() {
  const [age, setAge] = useState(30)
  const [gender, setGender] = useState('male')
  const [height, setHeight] = useState(170)
  const [weight, setWeight] = useState(70)
  const [unit, setUnit] = useState('metric')
  const [bmi, setBMI] = useState(null)
  const [bmiCategory, setBMICategory] = useState('')
  const [calories, setCalories] = useState({ low: 0, maintenance: 0, high: 0 })

  useEffect(() => {
    calculateBMI()
  }, [height, weight, unit, age, gender])

  const calculateBMI = () => {
    let bmiValue
    let weightKg = unit === 'metric' ? weight : weight / 2.205
    let heightM = unit === 'metric' ? height / 100 : height * 0.0254

    bmiValue = weightKg / Math.pow(heightM, 2)
    setBMI(parseFloat(bmiValue.toFixed(1)))

    if (bmiValue < 18.5) setBMICategory('Underweight')
    else if (bmiValue < 25) setBMICategory('Normal')
    else if (bmiValue < 30) setBMICategory('Overweight')
    else setBMICategory('Obese')

    const bmr = gender === 'male'
      ? 10 * weightKg + 6.25 * (heightM * 100) - 5 * age + 5
      : 10 * weightKg + 6.25 * (heightM * 100) - 5 * age - 161

    setCalories({
      low: Math.round(bmr * 1.2 - 500),
      maintenance: Math.round(bmr * 1.2),
      high: Math.round(bmr * 1.2 + 500)
    })
  }

  const handleUnitChange = () => {
    const newUnit = unit === 'metric' ? 'imperial' : 'metric'
    setUnit(newUnit)
    if (newUnit === 'imperial') {
      setHeight(Math.round(height / 2.54))
      setWeight(Math.round(weight * 2.205))
    } else {
      setHeight(Math.round(height * 2.54))
      setWeight(Math.round(weight / 2.205))
    }
  }

  return (
    (<div className="max-w-2xl mx-auto p-6 bg-gray-800 text-gray-100" style={{marginTop:"2rem"}}>
      <h1 className="text-3xl font-bold text-center mb-6">BMI Calculator</h1>
        <div className="mb-6">
          <label className="block mb-2">Units:</label>
          <button
            onClick={handleUnitChange}
            className="px-4 py-2 bg-gray-700 text-gray-100 rounded hover:bg-gray-600">
            {unit === 'metric' ? 'Switch to Imperial' : 'Switch to Metric'}
          </button>
        </div>
      <span style={{display:"flex", gap:"1rem"}}>
        <div className="mb-4 flex-1">
          <label className="block mb-2">Age:</label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(parseInt(e.target.value))}
            className="w-full p-2 bg-gray-700 text-gray-100 rounded" />
        </div>
        <div className="mb-4 flex-1">
          <label className="block mb-2">Gender:</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="w-full p-2 bg-gray-700 text-gray-100 rounded">
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </span>
      <span style={{display:"flex", gap:"1rem"}}>
        <div className="mb-4 flex-1">
          <label className="block mb-2">Height ({unit === 'metric' ? 'cm' : 'inches'}):</label>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(parseFloat(e.target.value))}
            className="w-full p-2 bg-gray-700 text-gray-100 rounded" />
        </div>
        <div className="mb-6 flex-1">
          <label className="block mb-2">Weight ({unit === 'metric' ? 'kg' : 'lbs'}):</label>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(parseFloat(e.target.value))}
            className="w-full p-2 bg-gray-700 text-gray-100 rounded" />
        </div>
      </span>

      {bmi && (
        <div className="text-center mt-6">
          <h2 className="text-2xl font-bold">Your BMI: {bmi}</h2>
          <p className="text-xl mt-2">Category: {bmiCategory}</p>
          <h3 className="text-xl font-semibold mt-4">Daily Calorie Recommendations:</h3>
          <p>For weight loss: {calories.low} calories</p>
          <p>For maintenance: {calories.maintenance} calories</p>
          <p>For weight gain: {calories.high} calories</p>
        </div>
      )}
      <div className="mt-8 text-sm leading-relaxed">
        <h3 className="font-bold mb-2">BMI Categories:</h3>
        <ul className="list-disc pl-5">
          <li>Underweight: &lt; 18.5</li>
          <li>Normal weight: 18.5 - 24.9</li>
          <li>Overweight: 25 - 29.9</li>
          <li>Obesity: ≥ 30</li>
        </ul>
        <p className="mt-4">Note: BMI is a general indicator and doesn't account for factors like muscle mass, bone density, age, and sex.</p>
      </div>
    </div>)
  );
}