import React, { useState, useEffect } from 'react'
import { Activity, Scale, Ruler, Calendar, User, Info } from 'lucide-react'

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

    // Avoid division by zero
    if (heightM <= 0) return;

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

  const handleUnitChange = (newUnit) => {
    if (unit === newUnit) return;
    setUnit(newUnit)
    if (newUnit === 'imperial') {
      setHeight(Math.round(height / 2.54))
      setWeight(Math.round(weight * 2.205))
    } else {
      setHeight(Math.round(height * 2.54))
      setWeight(Math.round(weight / 2.205))
    }
  }

  const getCategoryColor = (category) => {
    switch (category) {
      case 'Underweight': return 'text-blue-500 bg-blue-50 dark:bg-blue-900/20';
      case 'Normal': return 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20';
      case 'Overweight': return 'text-orange-500 bg-orange-50 dark:bg-orange-900/20';
      case 'Obese': return 'text-rose-500 bg-rose-50 dark:bg-rose-900/20';
      default: return 'text-zinc-500';
    }
  }

  const getProgressWidth = () => {
    if (!bmi) return 0;
    // Map BMI 15-40 to 0-100%
    const min = 15;
    const max = 40;
    const percentage = ((bmi - min) / (max - min)) * 100;
    return Math.min(Math.max(percentage, 0), 100);
  }

  return (
    <div className="mx-auto p-4 sm:p-8">
      <div className="bg-surface-light dark:bg-surface-dark rounded-2xl shadow-soft border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Activity className="text-primary" />
                BMI Calculator
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">Calculate your Body Mass Index and daily calorie needs.</p>
            </div>

            <div className="flex bg-zinc-200 dark:bg-zinc-800 rounded-lg p-1">
              <button
                onClick={() => handleUnitChange('metric')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${unit === 'metric' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
                Metric
              </button>
              <button
                onClick={() => handleUnitChange('imperial')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${unit === 'imperial' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
                Imperial
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Inputs */}
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
                  <User size={16} /> Gender
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
                  <Calendar size={16} /> Age
                </label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(parseInt(e.target.value))}
                  className="w-full p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
                <Ruler size={16} /> Height <span className="text-zinc-400 text-xs font-normal ml-auto">{unit === 'metric' ? '(cm)' : '(inches)'}</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(parseFloat(e.target.value))}
                  className="w-full p-3 pl-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-lg" />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 font-medium text-sm">
                  {unit === 'metric' ? 'cm' : 'in'}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
                <Scale size={16} /> Weight <span className="text-zinc-400 text-xs font-normal ml-auto">{unit === 'metric' ? '(kg)' : '(lbs)'}</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(parseFloat(e.target.value))}
                  className="w-full p-3 pl-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-lg" />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 font-medium text-sm">
                  {unit === 'metric' ? 'kg' : 'lbs'}
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-6 flex flex-col justify-center">
            {bmi ? (
              <>
                <div className="text-center mb-6">
                  <p className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-2">Your BMI Score</p>
                  <div className="relative inline-block">
                    <span className="text-6xl font-bold text-zinc-900 dark:text-white">{bmi}</span>
                  </div>
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold mt-2 ${getCategoryColor(bmiCategory)}`}>
                    {bmiCategory}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-8 relative pt-6">
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden flex">
                    <div className="w-[14%] h-full bg-blue-400" title="Underweight" />
                    <div className="w-[26%] h-full bg-emerald-400" title="Normal" />
                    <div className="w-[20%] h-full bg-orange-400" title="Overweight" />
                    <div className="w-[40%] h-full bg-rose-400" title="Obese" />
                  </div>
                  {/* Indicator */}
                  <div
                    className="absolute top-0 w-0.5 h-8 bg-zinc-900 dark:bg-white transition-all duration-500"
                    style={{ left: `${getProgressWidth()}%` }}
                  >
                    <div className="absolute -top-1 -translate-x-1/2 w-3 h-3 bg-zinc-900 dark:bg-white rounded-full" />
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-400 mt-1 font-medium">
                    <span>15</span>
                    <span>18.5</span>
                    <span>25</span>
                    <span>30</span>
                    <span>40+</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2 mb-3">
                    <Info size={16} className="text-primary" /> Daily Calorie Needs
                  </h3>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 p-3 rounded-lg text-center">
                      <p className="text-xs text-zinc-500 mb-1">Weight Loss</p>
                      <p className="font-bold text-lg text-blue-600 dark:text-blue-400">{calories.low}</p>
                    </div>
                    <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 p-3 rounded-lg text-center ring-2 ring-emerald-500/20">
                      <p className="text-xs text-zinc-500 mb-1">Maintain</p>
                      <p className="font-bold text-lg text-emerald-600 dark:text-emerald-400">{calories.maintenance}</p>
                    </div>
                    <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 p-3 rounded-lg text-center">
                      <p className="text-xs text-zinc-500 mb-1">Weight Gain</p>
                      <p className="font-bold text-lg text-orange-600 dark:text-orange-400">{calories.high}</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-zinc-400">
                <Activity size={48} className="mx-auto mb-4 opacity-50" />
                <p>Enter your details to calculate BMI</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-8 py-6 bg-zinc-50 dark:bg-zinc-900/30 border-t border-zinc-100 dark:border-zinc-800">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2">
            <Info size={14} /> BMI Categories Reference
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <div className="w-3 h-3 rounded-full bg-blue-400" />
              <span>Underweight (&lt; 18.5)</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
              <span>Normal (18.5 - 24.9)</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <div className="w-3 h-3 rounded-full bg-orange-400" />
              <span>Overweight (25 - 29.9)</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <div className="w-3 h-3 rounded-full bg-rose-400" />
              <span>Obese (&ge; 30)</span>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-zinc-400">
            Note: BMI is a general indicator and doesn't account for factors like muscle mass, bone density, age, and sex. Consult a professional for accurate health assessment.
          </p>
        </div>
      </div>
    </div>
  );
}
