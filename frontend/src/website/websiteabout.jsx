import React from 'react';

export default function WebsiteAbout() {
  return (
    <div className="bg-gray-900 text-white min-h-screen">
      

      <div className="h-64 bg-cover bg-center" style={{backgroundImage: "url('/placeholder.svg?height=400&width=1200')"}}>
        <div className="h-full w-full bg-black bg-opacity-50 flex items-center justify-center">
          <h1 className="text-4xl font-bold">About EZTRACK</h1>
        </div>
      </div>

      <div className="container mx-auto py-16 px-16">

        <section className="mb-16">
          <h2 className="text-3xl font-bold mb-4">About Our Web App</h2>
          <p className="text-lg mb-4">
            EZTRACK is a comprehensive gym management system designed to meet the demanding needs of modern Gym. Our web-based platform offers a suite of powerful tools that simplify day-to-day operations and provide valuable insights into your business.
          </p>
          <p className="text-lg">
            Whether you're managing a small size gym or a large multi-location gym chain, EZTRACK scales to fit your needs, providing a seamless experience.
          </p>
        </section>

        <section>
          <h2 className="text-3xl font-bold mb-4">Key Features</h2>
          <ul className="list-disc list-inside text-lg space-y-2">
            <li>Member management and tracking</li>
            <li>Attendance tracking and reporting, SOON.....</li>
            <li>Inventory management for gym merchandise and suppliment selling</li>
            <li>Comprehensive analytics and business insights</li>
          </ul>
        </section>
      </div>

      
    </div>
  );
}